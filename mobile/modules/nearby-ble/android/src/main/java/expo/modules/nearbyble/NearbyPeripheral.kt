package expo.modules.nearbyble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * The peripheral half of Bluesight's Bluetooth protocol (see docs/PROTOCOL.md):
 *
 *  - advertises only the service UUID (no name, no identifiers)
 *  - CARD  (read):  the signed profile card, ≤ 512 bytes; long reads are served by offset
 *  - INBOX (write): framed envelopes from other phones, forwarded to JS untouched
 *  - PHOTO (write u16 start, then read repeatedly): the profile photo in ≤ 480-byte chunks
 *
 * Everything cryptographic happens in JS; this class only moves bytes.
 * Permissions (BLUETOOTH_ADVERTISE / BLUETOOTH_CONNECT) are requested from JS before start().
 */
@SuppressLint("MissingPermission")
class NearbyPeripheral(
  private val context: Context,
  private val onInbox: (from: String, data: ByteArray) -> Unit,
  private val onState: (state: String, message: String?) -> Unit,
) {
  private val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
  private var server: BluetoothGattServer? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertising = false

  private var serviceUuid: UUID = UUID.randomUUID()
  private var cardUuid: UUID = UUID.randomUUID()
  private var inboxUuid: UUID = UUID.randomUUID()
  private var photoUuid: UUID = UUID.randomUUID()

  @Volatile private var card = ByteArray(0)
  @Volatile private var photo: ByteArray? = null

  // Per connected phone: which photo chunk comes next, and the last one served (for long reads).
  private val photoCursor = ConcurrentHashMap<String, Int>()
  private val lastChunk = ConcurrentHashMap<String, ByteArray>()
  // Prepared ("long") writes being assembled, keyed by "address|characteristic".
  private val prepared = ConcurrentHashMap<String, ByteArrayOutputStream>()

  fun start(
    service: UUID,
    cardChar: UUID,
    inboxChar: UUID,
    photoChar: UUID,
    cardBytes: ByteArray,
    photoBytes: ByteArray?,
  ) {
    stop()
    val adapter = manager?.adapter ?: throw IllegalStateException("This phone has no Bluetooth.")
    if (!adapter.isEnabled) throw IllegalStateException("Bluetooth is off.")
    val adv = adapter.bluetoothLeAdvertiser
      ?: throw IllegalStateException("This phone can't advertise over Bluetooth LE, so others can't see it. You can still browse.")
    serviceUuid = service
    cardUuid = cardChar
    inboxUuid = inboxChar
    photoUuid = photoChar
    card = cardBytes
    photo = photoBytes
    advertiser = adv
    val gatt = manager.openGattServer(context, callback)
      ?: throw IllegalStateException("Couldn't open the Bluetooth GATT server.")
    server = gatt
    val svc = BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    svc.addCharacteristic(
      BluetoothGattCharacteristic(
        cardUuid,
        BluetoothGattCharacteristic.PROPERTY_READ,
        BluetoothGattCharacteristic.PERMISSION_READ,
      ),
    )
    svc.addCharacteristic(
      BluetoothGattCharacteristic(
        inboxUuid,
        BluetoothGattCharacteristic.PROPERTY_WRITE,
        BluetoothGattCharacteristic.PERMISSION_WRITE,
      ),
    )
    svc.addCharacteristic(
      BluetoothGattCharacteristic(
        photoUuid,
        BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
        BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE,
      ),
    )
    // Advertising starts in onServiceAdded, once the service actually exists.
    if (!gatt.addService(svc)) throw IllegalStateException("Couldn't add the Bluetooth service.")
  }

  fun stop() {
    try {
      if (advertising) advertiser?.stopAdvertising(advertiseCallback)
    } catch (_: Exception) {
    }
    try {
      server?.clearServices()
      server?.close()
    } catch (_: Exception) {
    }
    advertising = false
    server = null
    advertiser = null
    photoCursor.clear()
    lastChunk.clear()
    prepared.clear()
  }

  fun setCard(bytes: ByteArray) {
    card = bytes
  }

  fun setPhoto(bytes: ByteArray?) {
    photo = bytes
    photoCursor.clear()
    lastChunk.clear()
  }

  private fun startAdvertising() {
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .setConnectable(true)
      .setTimeout(0)
      .build()
    // 3 bytes flags + 18 bytes for one 128-bit UUID = 21 of the 31 available. Nothing else is sent.
    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .setIncludeTxPowerLevel(false)
      .addServiceUuid(ParcelUuid(serviceUuid))
      .build()
    advertiser?.startAdvertising(settings, data, advertiseCallback)
  }

  private val advertiseCallback = object : AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
      advertising = true
      onState("advertising", null)
    }

    override fun onStartFailure(errorCode: Int) {
      advertising = false
      val why = when (errorCode) {
        ADVERTISE_FAILED_DATA_TOO_LARGE -> "data too large"
        ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "too many apps advertising"
        ADVERTISE_FAILED_ALREADY_STARTED -> "already started"
        ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "not supported on this phone"
        else -> "internal error"
      }
      onState("error", "Bluetooth advertising failed: $why")
    }
  }

  /** Next chunk for this phone: u16 index | u16 count | payload. */
  private fun nextPhotoChunk(address: String): ByteArray {
    val p = photo ?: return byteArrayOf(0, 0, 0, 0)
    val count = maxOf(1, (p.size + CHUNK - 1) / CHUNK)
    val idx = photoCursor[address] ?: 0
    val start = minOf(p.size, idx * CHUNK)
    val end = minOf(p.size, start + CHUNK)
    val out = ByteArray(4 + (end - start))
    out[0] = (idx shr 8).toByte()
    out[1] = idx.toByte()
    out[2] = (count shr 8).toByte()
    out[3] = count.toByte()
    System.arraycopy(p, start, out, 4, end - start)
    photoCursor[address] = idx + 1
    return out
  }

  private fun handleWrite(address: String, uuid: UUID, bytes: ByteArray) {
    when (uuid) {
      inboxUuid -> if (bytes.isNotEmpty() && bytes.size <= MAX_ATTR) onInbox(address, bytes)
      photoUuid -> if (bytes.size >= 2) {
        photoCursor[address] = ((bytes[0].toInt() and 0xff) shl 8) or (bytes[1].toInt() and 0xff)
        lastChunk.remove(address)
      }
    }
  }

  private val callback = object : BluetoothGattServerCallback() {
    override fun onServiceAdded(status: Int, service: BluetoothGattService) {
      if (status == BluetoothGatt.GATT_SUCCESS) startAdvertising()
      else onState("error", "Couldn't add the Bluetooth service ($status)")
    }

    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        val a = device.address
        photoCursor.remove(a)
        lastChunk.remove(a)
        prepared.keys.removeIf { it.startsWith("$a|") }
      }
    }

    override fun onCharacteristicReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic,
    ) {
      val s = server ?: return
      val a = device.address
      val value: ByteArray? = when (characteristic.uuid) {
        cardUuid -> card
        // Offset 0 = a new chunk. A non-zero offset is the OS fetching the rest of the same chunk.
        photoUuid -> if (offset == 0) nextPhotoChunk(a).also { lastChunk[a] = it } else lastChunk[a]
        else -> null
      }
      when {
        value == null -> s.sendResponse(device, requestId, BluetoothGatt.GATT_READ_NOT_PERMITTED, offset, null)
        offset > value.size -> s.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
        else -> s.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value.copyOfRange(offset, value.size))
      }
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray?,
    ) {
      val s = server ?: return
      val bytes = value ?: ByteArray(0)
      val uuid = characteristic.uuid
      if (uuid != inboxUuid && uuid != photoUuid) {
        if (responseNeeded) s.sendResponse(device, requestId, BluetoothGatt.GATT_WRITE_NOT_PERMITTED, offset, null)
        return
      }
      if (preparedWrite) {
        val key = "${device.address}|$uuid"
        val buf = prepared.getOrPut(key) { ByteArrayOutputStream() }
        if (offset != buf.size() || buf.size() + bytes.size > MAX_ATTR) {
          prepared.remove(key)
          if (responseNeeded) s.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
          return
        }
        buf.write(bytes)
        if (responseNeeded) s.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, bytes)
        return
      }
      if (responseNeeded) s.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
      handleWrite(device.address, uuid, bytes)
    }

    override fun onExecuteWrite(device: BluetoothDevice, requestId: Int, execute: Boolean) {
      val s = server ?: return
      val a = device.address
      for (key in prepared.keys.filter { it.startsWith("$a|") }) {
        val buf = prepared.remove(key) ?: continue
        if (execute) handleWrite(a, UUID.fromString(key.substringAfter('|')), buf.toByteArray())
      }
      s.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
    }
  }

  companion object {
    const val CHUNK = 480
    const val MAX_ATTR = 512

    fun isSupported(context: Context): Boolean {
      val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter ?: return false
      return adapter.isEnabled && adapter.bluetoothLeAdvertiser != null
    }
  }
}

import CoreBluetooth
import Foundation

struct NearbyBleError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

/**
 The peripheral half of Bluesight's Bluetooth protocol (see docs/PROTOCOL.md):

  - advertises only the service UUID
  - CARD  (read):  the signed profile card, served by offset for long reads
  - INBOX (write): framed envelopes from other phones, forwarded to JS untouched
  - PHOTO (write u16 start, then read repeatedly): the photo in ≤ 480-byte chunks

 All state lives on one serial queue, which is also CoreBluetooth's delegate queue.
 Note: iOS only advertises service UUIDs, and only while the app is in the foreground
 (in the background they move to an overflow area other iPhones can see but Android can't).
 */
final class NearbyPeripheral: NSObject, CBPeripheralManagerDelegate {
  private static let chunkSize = 480
  private static let maxAttr = 512

  private let queue = DispatchQueue(label: "app.bluesight.nearby-ble")
  private var manager: CBPeripheralManager?
  private var wantRunning = false
  private var pendingStart: ((Error?) -> Void)?

  private var serviceUUID = CBUUID(string: "a9bea750-f935-4078-b5d8-95cba1596cd9")
  private var cardUUID = CBUUID(string: "a9bea751-f935-4078-b5d8-95cba1596cd9")
  private var inboxUUID = CBUUID(string: "a9bea752-f935-4078-b5d8-95cba1596cd9")
  private var photoUUID = CBUUID(string: "a9bea753-f935-4078-b5d8-95cba1596cd9")

  private var card = Data()
  private var photo: Data?
  private var photoCursor: [UUID: Int] = [:]
  private var lastChunk: [UUID: Data] = [:]

  private let onInbox: (String, Data) -> Void
  private let onState: (String, String?) -> Void

  init(onInbox: @escaping (String, Data) -> Void, onState: @escaping (String, String?) -> Void) {
    self.onInbox = onInbox
    self.onState = onState
    super.init()
  }

  func start(service: CBUUID, card cardChar: CBUUID, inbox: CBUUID, photo photoChar: CBUUID, cardBytes: Data, photoBytes: Data?, completion: @escaping (Error?) -> Void) {
    queue.async {
      self.stopLocked()
      self.serviceUUID = service
      self.cardUUID = cardChar
      self.inboxUUID = inbox
      self.photoUUID = photoChar
      self.card = cardBytes
      self.photo = photoBytes
      self.wantRunning = true
      self.pendingStart = completion
      if let m = self.manager {
        self.peripheralManagerDidUpdateState(m)
      } else {
        // Creating the manager shows the Bluetooth permission prompt the first time.
        self.manager = CBPeripheralManager(delegate: self, queue: self.queue, options: [CBPeripheralManagerOptionShowPowerAlertKey: false])
      }
    }
  }

  func stop() {
    queue.async { self.stopLocked() }
  }

  func setCard(_ data: Data) {
    queue.async { self.card = data }
  }

  func setPhoto(_ data: Data?) {
    queue.async {
      self.photo = data
      self.photoCursor.removeAll()
      self.lastChunk.removeAll()
    }
  }

  private func stopLocked() {
    wantRunning = false
    if let m = manager {
      if m.isAdvertising { m.stopAdvertising() }
      m.removeAllServices()
    }
    photoCursor.removeAll()
    lastChunk.removeAll()
  }

  private func finish(_ error: String?) {
    if let error { onState("error", error) }
    if let done = pendingStart {
      pendingStart = nil
      done(error.map { NearbyBleError(message: $0) })
    }
  }

  private func setupService() {
    guard let m = manager, wantRunning else { return }
    m.removeAllServices()
    let cardChar = CBMutableCharacteristic(type: cardUUID, properties: [.read], value: nil, permissions: [.readable])
    let inboxChar = CBMutableCharacteristic(type: inboxUUID, properties: [.write], value: nil, permissions: [.writeable])
    let photoChar = CBMutableCharacteristic(type: photoUUID, properties: [.read, .write], value: nil, permissions: [.readable, .writeable])
    let svc = CBMutableService(type: serviceUUID, primary: true)
    svc.characteristics = [cardChar, inboxChar, photoChar]
    m.add(svc)
  }

  // MARK: CBPeripheralManagerDelegate

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    switch peripheral.state {
    case .poweredOn:
      setupService()
    case .poweredOff:
      finish("Bluetooth is off.")
    case .unauthorized:
      finish("Bluetooth permission is off for Bluesight. Turn it on in Settings.")
    case .unsupported:
      finish("This device can't use Bluetooth LE.")
    default:
      break // .unknown / .resetting: wait for the next update
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    if let error {
      finish("Couldn't add the Bluetooth service: \(error.localizedDescription)")
      return
    }
    peripheral.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [serviceUUID]])
  }

  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    if let error {
      finish("Bluetooth advertising failed: \(error.localizedDescription)")
    } else {
      onState("advertising", nil)
      finish(nil)
    }
  }

  private func nextChunk(for central: UUID) -> Data {
    guard let p = photo else { return Data([0, 0, 0, 0]) }
    let count = max(1, (p.count + Self.chunkSize - 1) / Self.chunkSize)
    let idx = photoCursor[central] ?? 0
    let start = min(p.count, idx * Self.chunkSize)
    let end = min(p.count, start + Self.chunkSize)
    var out = Data([UInt8((idx >> 8) & 0xff), UInt8(idx & 0xff), UInt8((count >> 8) & 0xff), UInt8(count & 0xff)])
    out.append(p.subdata(in: start..<end))
    photoCursor[central] = idx + 1
    return out
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    let central = request.central.identifier
    let value: Data?
    switch request.characteristic.uuid {
    case cardUUID:
      value = card
    case photoUUID:
      // Offset 0 = next chunk. A non-zero offset is iOS fetching the rest of the same chunk.
      if request.offset == 0 {
        let c = nextChunk(for: central)
        lastChunk[central] = c
        value = c
      } else {
        value = lastChunk[central]
      }
    default:
      value = nil
    }
    guard let v = value else {
      peripheral.respond(to: request, withResult: .readNotPermitted)
      return
    }
    guard request.offset <= v.count else {
      peripheral.respond(to: request, withResult: .invalidOffset)
      return
    }
    request.value = v.subdata(in: request.offset..<v.count)
    peripheral.respond(to: request, withResult: .success)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    guard let first = requests.first else { return }
    // A long write arrives as several requests with offsets; assemble before handing on.
    var assembled: [CBUUID: Data] = [:]
    for r in requests.sorted(by: { $0.offset < $1.offset }) {
      let uuid = r.characteristic.uuid
      guard uuid == inboxUUID || uuid == photoUUID else {
        peripheral.respond(to: first, withResult: .writeNotPermitted)
        return
      }
      var d = assembled[uuid] ?? Data()
      guard r.offset == d.count, d.count + (r.value?.count ?? 0) <= Self.maxAttr else {
        peripheral.respond(to: first, withResult: .invalidOffset)
        return
      }
      d.append(r.value ?? Data())
      assembled[uuid] = d
    }
    peripheral.respond(to: first, withResult: .success)
    let from = first.central.identifier
    for (uuid, data) in assembled {
      if uuid == inboxUUID, !data.isEmpty {
        onInbox(from.uuidString, data)
      } else if uuid == photoUUID, data.count >= 2 {
        photoCursor[from] = (Int(data[data.startIndex]) << 8) | Int(data[data.startIndex + 1])
        lastChunk[from] = nil
      }
    }
  }
}

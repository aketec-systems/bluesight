package expo.modules.nearbyble

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.UUID

class StartOptions : Record {
  @Field var serviceUuid: String = ""
  @Field var cardUuid: String = ""
  @Field var inboxUuid: String = ""
  @Field var photoUuid: String = ""
  @Field var card: String = ""
  @Field var photo: String? = null
}

/** Thin JS bridge over NearbyPeripheral. Bytes cross as base64. */
class NearbyBleModule : Module() {
  private var peripheral: NearbyPeripheral? = null

  private fun decode(b64: String): ByteArray = Base64.decode(b64, Base64.DEFAULT)

  override fun definition() = ModuleDefinition {
    Name("NearbyBle")

    Events("onInbox", "onState")

    AsyncFunction("isSupported") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      NearbyPeripheral.isSupported(ctx)
    }

    AsyncFunction("start") { options: StartOptions ->
      val ctx = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "The app isn't ready yet.", null)
      val p = peripheral ?: NearbyPeripheral(
        ctx,
        onInbox = { from, data ->
          sendEvent("onInbox", mapOf("from" to from, "data" to Base64.encodeToString(data, Base64.NO_WRAP)))
        },
        onState = { state, message -> sendEvent("onState", mapOf("state" to state, "message" to message)) },
      ).also { peripheral = it }
      try {
        p.start(
          UUID.fromString(options.serviceUuid),
          UUID.fromString(options.cardUuid),
          UUID.fromString(options.inboxUuid),
          UUID.fromString(options.photoUuid),
          decode(options.card),
          options.photo?.let { decode(it) },
        )
      } catch (e: SecurityException) {
        throw CodedException("ERR_PERMISSION", "Bluetooth permission is missing.", e)
      } catch (e: IllegalStateException) {
        throw CodedException("ERR_UNAVAILABLE", e.message ?: "Bluetooth is unavailable.", e)
      }
    }

    AsyncFunction("setCard") { card: String ->
      peripheral?.setCard(decode(card))
    }

    AsyncFunction("setPhoto") { photo: String? ->
      peripheral?.setPhoto(photo?.let { decode(it) })
    }

    AsyncFunction("stop") {
      peripheral?.stop()
    }

    OnDestroy {
      peripheral?.stop()
      peripheral = null
    }
  }
}

import CoreBluetooth
import ExpoModulesCore

struct StartOptions: Record {
  @Field var serviceUuid: String = ""
  @Field var cardUuid: String = ""
  @Field var inboxUuid: String = ""
  @Field var photoUuid: String = ""
  @Field var card: String = ""
  @Field var photo: String? = nil
}

/// Thin JS bridge over NearbyPeripheral. Bytes cross as base64.
public class NearbyBleModule: Module {
  private var peripheral: NearbyPeripheral?

  public func definition() -> ModuleDefinition {
    Name("NearbyBle")

    Events("onInbox", "onState")

    AsyncFunction("isSupported") { () -> Bool in
      // Every iPhone that runs this app can act as a Bluetooth LE peripheral.
      return true
    }

    AsyncFunction("start") { (options: StartOptions, promise: Promise) in
      guard
        let service = UUID(uuidString: options.serviceUuid),
        let cardChar = UUID(uuidString: options.cardUuid),
        let inbox = UUID(uuidString: options.inboxUuid),
        let photoChar = UUID(uuidString: options.photoUuid),
        let card = Data(base64Encoded: options.card)
      else {
        promise.reject("ERR_ARGS", "Invalid Bluetooth options.")
        return
      }
      let photo = options.photo.flatMap { Data(base64Encoded: $0) }
      let p = self.peripheral ?? NearbyPeripheral(
        onInbox: { [weak self] from, data in
          self?.sendEvent("onInbox", ["from": from, "data": data.base64EncodedString()])
        },
        onState: { [weak self] state, message in
          self?.sendEvent("onState", ["state": state, "message": message ?? ""])
        }
      )
      self.peripheral = p
      p.start(
        service: CBUUID(nsuuid: service),
        card: CBUUID(nsuuid: cardChar),
        inbox: CBUUID(nsuuid: inbox),
        photo: CBUUID(nsuuid: photoChar),
        cardBytes: card,
        photoBytes: photo
      ) { error in
        if let error {
          promise.reject("ERR_UNAVAILABLE", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("setCard") { (card: String) in
      self.peripheral?.setCard(Data(base64Encoded: card) ?? Data())
    }

    AsyncFunction("setPhoto") { (photo: String?) in
      self.peripheral?.setPhoto(photo.flatMap { Data(base64Encoded: $0) })
    }

    AsyncFunction("stop") {
      self.peripheral?.stop()
    }

    OnDestroy {
      self.peripheral?.stop()
    }
  }
}

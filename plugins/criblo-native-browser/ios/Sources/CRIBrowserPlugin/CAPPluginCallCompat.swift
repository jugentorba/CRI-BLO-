import Foundation
import Capacitor
import UIKit

// Capacitor 8.5's SwiftPM binary exposes a smaller Swift surface than the
// source module. Supply the conveniences used by CRI-BLO's native browser so
// the same plugin source works with the binary package shipped by Capacitor.
extension CAPPluginCall {
    func getString(_ key: String) -> String? {
        options[key] as? String
    }

    func getBool(_ key: String) -> Bool? {
        options[key] as? Bool
    }

    // The SwiftPM binary does not export the source-only reject convenience.
    // These branches are validation failures before the browser is presented;
    // return a structured failure payload so the JS caller can stop cleanly.
    func reject(_ message: String) {
        resolve(["error": message, "ok": false])
    }
}

extension CAPBridgeProtocol {
    // Capacitor's source protocol exposes viewController, but the 8.5 binary
    // Swift interface can omit it. The concrete bridge remains Objective-C
    // compatible, so recover the host controller through KVC when available.
    var viewController: UIViewController? {
        guard let object = self as? NSObject,
              object.responds(to: NSSelectorFromString("viewController")) else {
            return nil
        }
        return object.value(forKey: "viewController") as? UIViewController
    }
}

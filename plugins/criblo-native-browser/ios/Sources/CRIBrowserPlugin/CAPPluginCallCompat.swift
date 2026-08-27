import Foundation
import Capacitor

// Capacitor 8.5's SwiftPM binary exposes the default-value accessors on
// CAPPluginCall, while CRI-BLO's native browser also uses the optional
// convenience accessors that are present in Capacitor's source tree. Keep the
// plugin source portable by supplying those small conveniences locally.
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

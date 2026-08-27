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

    func reject(_ message: String) {
        errorHandler(CAPPluginCallError(message: message, code: nil, error: nil, data: nil))
    }
}

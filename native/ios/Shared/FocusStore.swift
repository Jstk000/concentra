import Foundation
import DeviceActivity
import ManagedSettings

enum FocusStore {
    static let settings = ManagedSettingsStore(named: .init("Concentra"))
    static let deadlineKey = "focus.deadline"
    static let group = "group." + (Bundle.main.object(forInfoDictionaryKey: "ConcentraBaseID") as! String)
    static let shared = UserDefaults(suiteName: group)!
    static var deadline: Int64 { (shared.object(forKey: deadlineKey) as? NSNumber)?.int64Value ?? 0 }
    static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    static func clearIfExpired() {
        let end = deadline
        if end > 0 && end <= now {
            settings.clearAllSettings()
            shared.removeObject(forKey: deadlineKey)
        }
    }
}

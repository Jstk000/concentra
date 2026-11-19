import DeviceActivity

final class Monitor: DeviceActivityMonitor {
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        guard activity.rawValue == String(FocusStore.deadline) else { return }
        FocusStore.clearIfExpired()
    }
}

package cl.concentra.estudio;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;
import java.util.Collections;

public final class FocusService extends AccessibilityService {
    static volatile boolean connected;
    @Override protected void onServiceConnected() { connected = true; }
    @Override public boolean onUnbind(Intent intent) {
        connected = false;
        return super.onUnbind(intent);
    }
    @Override public void onDestroy() { connected = false; super.onDestroy(); }
    @Override public void onInterrupt() {}
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        SharedPreferences prefs = getSharedPreferences("focus", MODE_PRIVATE);
        if (prefs.getLong("end", 0) <= System.currentTimeMillis()) return;
        if (prefs.getStringSet("apps", Collections.emptySet()).contains(event.getPackageName().toString()))
            performGlobalAction(GLOBAL_ACTION_HOME);
    }
}

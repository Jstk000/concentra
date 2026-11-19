package cl.concentra.estudio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.Toast;
import java.util.*;

public final class StudyActivity extends Activity {
    private static final String HOME = "https://jstk000.github.io/concentra/";
    private WebView web;
    private SharedPreferences prefs;
    private static boolean trusted(String text) {
        if (text == null) return false;
        Uri u = Uri.parse(text);
        return "https".equals(u.getScheme()) && "jstk000.github.io".equals(u.getAuthority())
            && ("/concentra/".equals(u.getPath()) || "/concentra/index.html".equals(u.getPath()));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("focus", MODE_PRIVATE);
        web = new WebView(this);
        setContentView(web);
        if (Build.VERSION.SDK_INT >= 30) web.setOnApplyWindowInsetsListener((v,insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            return insets;
        });
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " ConcentraNative/1");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest r) {
                if (!r.isForMainFrame() || trusted(r.getUrl().toString())) return false;
                if ("https".equals(r.getUrl().getScheme()) && r.hasGesture()) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl())); }
                    catch (android.content.ActivityNotFoundException ignored) {}
                }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError error) {
                if (req.isForMainFrame() && trusted(req.getUrl().toString()) && !isFinishing())
                    new AlertDialog.Builder(StudyActivity.this).setMessage("No se pudo cargar Concentra. Revisa tu conexión.")
                        .setPositiveButton("Reintentar",(d,w) -> web.loadUrl(HOME)).setNegativeButton("Cerrar",null).show();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsPrompt(WebView v,String url,String message,String argument,JsPromptResult r) {
                if (trusted(url) && trusted(v.getUrl()) && "concentra-device-v1".equals(message)) r.confirm(command(argument));
                else r.cancel();
                return true;
            }
        });
        web.loadUrl(HOME);
    }
    private String command(String cmd) {
        long end = prefs.getLong("end",0), now = System.currentTimeMillis();
        if ("status".equals(cmd)) return Long.toString(end);
        if (end > now) return "Ya hay un bloque protegido en este celular.";
        if ("choose".equals(cmd)) { web.post(this::chooseApps); return "OK"; }
        if (cmd == null || !cmd.matches("start:[0-9]{1,3}")) return "Duración inválida.";
        int minutes = Integer.parseInt(cmd.substring(6));
        if (minutes < 1 || minutes > 180) return "Elige entre 1 y 180 minutos.";
        if (prefs.getStringSet("apps",Collections.emptySet()).isEmpty())
            return "Primero abre Bloqueo y avisos y elige tus aplicaciones.";
        if (!FocusService.connected) {
            web.post(this::explainPermission);
            return "Activa el permiso de bloqueo y vuelve a iniciar el bloque.";
        }
        long deadline = now + minutes * 60000L;
        if (!prefs.edit().putLong("end",deadline).commit()) return "No se pudo guardar el bloque.";
        return Long.toString(deadline);
    }
    private void explainPermission() {
        new AlertDialog.Builder(this).setTitle("Permitir el bloqueo de apps")
            .setMessage("Concentra usa Accesibilidad para detectar el nombre de la app que abres durante el Pomodoro. Si elegiste bloquearla, te devuelve a Inicio. No lee el contenido de la pantalla. El nombre se procesa en tu celular y no se comparte. Si aceptas, activa Concentra en Accesibilidad.")
            .setPositiveButton("Aceptar y abrir ajustes",(d,w) -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)))
            .setNegativeButton("Ahora no",null).show();
    }
    private void chooseApps() {
        PackageManager pm = getPackageManager();
        Set<String> protectedApps = new HashSet<>(Arrays.asList(getPackageName(),"com.android.systemui","com.android.settings"));
        TelecomManager phone = (TelecomManager)getSystemService(TELECOM_SERVICE);
        if (phone != null) {
            protectedApps.add(phone.getDefaultDialerPackage());
            if (Build.VERSION.SDK_INT >= 29) protectedApps.add(phone.getSystemDialerPackage());
        }
        for (ResolveInfo home : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),PackageManager.MATCH_DEFAULT_ONLY))
            protectedApps.add(home.activityInfo.packageName);
        ResolveInfo home = pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),PackageManager.MATCH_DEFAULT_ONLY);
        if (home != null) protectedApps.add(home.activityInfo.packageName);
        List<ResolveInfo> apps = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0);
        apps.sort(new ResolveInfo.DisplayNameComparator(pm));
        List<String> labels = new ArrayList<>(), ids = new ArrayList<>();
        for (ResolveInfo info : apps) {
            String id = info.activityInfo.packageName;
            if (!protectedApps.contains(id) && !ids.contains(id)) { ids.add(id); labels.add(info.loadLabel(pm).toString()); }
        }
        Set<String> selected = new HashSet<>(prefs.getStringSet("apps",Collections.emptySet()));
        selected.retainAll(ids);
        boolean[] marked = new boolean[ids.size()];
        for (int i=0;i<ids.size();i++) marked[i]=selected.contains(ids.get(i));
        new AlertDialog.Builder(this).setTitle("Apps que quiero bloquear")
            .setMultiChoiceItems(labels.toArray(new String[0]),marked,(d,i,on) -> {
                if (on) selected.add(ids.get(i)); else selected.remove(ids.get(i));
            }).setPositiveButton("Guardar",(d,w) -> {
                if (!prefs.edit().putStringSet("apps", selected).commit()) { Toast.makeText(this,"No se pudo guardar.",Toast.LENGTH_LONG).show(); return; }
                if (!selected.isEmpty() && !FocusService.connected) explainPermission();
            }).setNegativeButton("Cancelar",null).show();
    }
}

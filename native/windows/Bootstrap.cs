using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

static class Bootstrap {
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [STAThread]
    static void Main() {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch(EntryPointNotFoundException) {}
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool first;
        using (var instance = new Mutex(true, @"Local\Concentra.Estudiar.v1", out first))
        using (var show = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Concentra.Mostrar.v1")) {
            if (!first) { show.Set(); return; }
            var assembly = Assembly.GetExecutingAssembly();
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs e) {
                string name = new AssemblyName(e.Name).Name;
                if (name != "Microsoft.Web.WebView2.Core" && name != "Microsoft.Web.WebView2.WinForms") return null;
                using (var input = assembly.GetManifestResourceStream(name + ".dll"))
                using (var bytes = new MemoryStream()) { input.CopyTo(bytes); return Assembly.Load(bytes.ToArray()); }
            };
            string temp = Path.Combine(Path.GetTempPath(), "Concentra-" + Guid.NewGuid().ToString("N"));
            try {
                Directory.CreateDirectory(temp);
                using (var input = assembly.GetManifestResourceStream("WebView2Loader.dll"))
                using (var file = File.Create(Path.Combine(temp, "WebView2Loader.dll"))) input.CopyTo(file);
                FocusWindow.Run(temp, show);
            } catch (Exception e) { MessageBox.Show(e.Message, "Concentra"); }
            finally { try { Directory.Delete(temp, true); } catch (IOException) {} catch (UnauthorizedAccessException) {} }
        }
    }
}

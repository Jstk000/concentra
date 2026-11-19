using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

sealed class FocusWindow : Form {
    const string Home = "https://jstk000.github.io/concentra/";
    readonly string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Concentra");
    readonly HashSet<string> selected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    readonly WebView2 web = new WebView2 { Dock = DockStyle.Fill };
    readonly NotifyIcon tray = new NotifyIcon { Text = "Concentra", Icon = System.Drawing.SystemIcons.Application };
    readonly System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer { Interval = 200 };
    long end;
    static long Now { get { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); } }

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int command);

    internal static void Run(string loader, EventWaitHandle show) {
        CoreWebView2Environment.SetLoaderDllFolderPath(loader);
        Application.Run(new FocusWindow(show));
    }
    static bool Trusted(string address) {
        Uri uri;
        return Uri.TryCreate(address, UriKind.Absolute, out uri)
            && uri.GetLeftPart(UriPartial.Authority) == "https://jstk000.github.io"
            && (uri.AbsolutePath == "/concentra/" || uri.AbsolutePath == "/concentra/index.html");
    }
    FocusWindow(EventWaitHandle show) {
        Directory.CreateDirectory(folder);
        string choices = Path.Combine(folder, "apps.txt"), session = Path.Combine(folder, "fin.txt");
        if (File.Exists(choices)) selected.UnionWith(File.ReadAllLines(choices).Where(Allowed));
        if (File.Exists(session)) long.TryParse(File.ReadAllText(session), out end);
        Text = "Concentra"; Width = 1024; Height = 780;
        Controls.Add(web);
        tray.DoubleClick += delegate { Reveal(); };
        tick.Tick += delegate {
            if (show.WaitOne(0)) Reveal();
            if (Now < end) Restrict(GetForegroundWindow(), selected);
            else if (end != 0) { end = 0; if (!Visible) Close(); }
        };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (e.CloseReason == CloseReason.UserClosing && Now < end) {
                e.Cancel = true; tray.Visible = true; Hide();
            }
        };
        FormClosed += delegate { tick.Dispose(); tray.Dispose(); };
        tick.Start();
        Shown += async delegate {
            try {
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(folder,"Web"));
                await web.EnsureCoreWebView2Async(env);
                var core = web.CoreWebView2;
                core.Settings.UserAgent += " ConcentraNative/1";
                core.Settings.AreDefaultScriptDialogsEnabled = false;
                core.NavigationStarting += (s,e) => { if (!Trusted(e.Uri)) e.Cancel = true; };
                core.ScriptDialogOpening += (s,e) => {
                    if (e.Kind != CoreWebView2ScriptDialogKind.Prompt || !Trusted(e.Uri) ||
                        !Trusted(core.Source) || e.Message != "concentra-device-v1") return;
                    try { e.ResultText = Command(e.DefaultText); }
                    catch (Exception) { e.ResultText = "No se pudo guardar el bloqueo en este PC."; }
                    e.Accept();
                };
                core.Navigate(Home);
            } catch (Exception e) { MessageBox.Show("No se pudo abrir Concentra. " + e.Message, Text); }
        };
    }
    void Reveal() { Show(); WindowState = FormWindowState.Normal; Activate(); tray.Visible = false; }
    static bool Allowed(string path) {
        if (String.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path) || !File.Exists(path)) return false;
        string full = Path.GetFullPath(path);
        return full.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
            && !full.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.Windows) + "\\", StringComparison.OrdinalIgnoreCase)
            && !full.Equals(Application.ExecutablePath, StringComparison.OrdinalIgnoreCase)
            && !Path.GetFileName(full).Equals("msedgewebview2.exe", StringComparison.OrdinalIgnoreCase);
    }
    internal static bool Restrict(IntPtr window, HashSet<string> paths) {
        if (window == IntPtr.Zero || paths.Count == 0) return false;
        int pid; GetWindowThreadProcessId(window, out pid);
        try {
            using (var proc = Process.GetProcessById(pid))
                return paths.Contains(proc.MainModule.FileName) && ShowWindowAsync(window, 6);
        } catch (System.ComponentModel.Win32Exception) { return false; }
          catch (InvalidOperationException) { return false; }
          catch (ArgumentException) { return false; }
    }
    void Write(string file, string[] lines) {
        string target = Path.Combine(folder,file), temp = target + ".new";
        File.WriteAllLines(temp, lines);
        if (File.Exists(target)) File.Replace(temp, target, null); else File.Move(temp, target);
    }
    string Command(string command) {
        if (command == "status") return Math.Max(0,end).ToString();
        if (end > Now) return "Ya tienes un bloque protegido en este PC.";
        if (command == "choose") { BeginInvoke(new Action(Choose)); return "OK"; }
        int minutes;
        if (!command.StartsWith("start:") || !Int32.TryParse(command.Substring(6),out minutes) || minutes < 1 || minutes > 180)
            return "Duración inválida.";
        if (!selected.Any(Allowed)) return "Primero abre Bloqueo y avisos y elige una aplicación instalada.";
        long deadline = Now + minutes * 60000L;
        Write("fin.txt", new[]{deadline.ToString()});
        end = deadline;
        return end.ToString();
    }
    void Choose() {
        using (var dialog = new Form { Text = "Aplicaciones que quiero bloquear", Width = 610, Height = 440, StartPosition = FormStartPosition.CenterParent })
        using (var list = new CheckedListBox { Dock = DockStyle.Fill, CheckOnClick = true, HorizontalScrollbar = true })
        using (var bar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 48 })
        using (var add = new Button { Text = "Buscar .exe…", AutoSize = true })
        using (var save = new Button { Text = "Guardar", DialogResult = DialogResult.OK, AutoSize = true }) {
            var paths = new SortedSet<string>(selected,StringComparer.OrdinalIgnoreCase);
            foreach (var process in Process.GetProcesses()) using (process) {
                try { if (process.MainWindowHandle != IntPtr.Zero && Allowed(process.MainModule.FileName)) paths.Add(process.MainModule.FileName); }
                catch (System.ComponentModel.Win32Exception) {} catch (InvalidOperationException) {}
            }
            foreach (var path in paths) list.Items.Add(path,selected.Contains(path));
            add.Click += delegate {
                using (var input = new OpenFileDialog { Filter = "Aplicaciones (*.exe)|*.exe", Multiselect = true }) {
                    if (input.ShowDialog(dialog) != DialogResult.OK) return;
                    foreach (var path in input.FileNames.Where(Allowed)) {
                        int i = list.Items.IndexOf(path);
                        if (i < 0) list.Items.Add(path,true); else list.SetItemChecked(i,true);
                    }
                }
            };
            bar.Controls.Add(add); bar.Controls.Add(save);
            dialog.Controls.Add(list); dialog.Controls.Add(bar);
            if (dialog.ShowDialog(this) == DialogResult.OK) {
                var next = list.CheckedItems.Cast<string>().ToArray();
                Write("apps.txt",next); selected.Clear(); selected.UnionWith(next);
            }
        }
    }
}

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
    readonly BrowserShield shield = new BrowserShield(GetForegroundWindow);
    HashSet<string> sites = new HashSet<string>();
    string sessionId = "", mode = "normal";
    bool sound = true, notice = true;
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
        if (end > Now) mode = "strict";
        var state = Path.Combine(folder,"sesion-v2.txt");
        if(File.Exists(state)) {
            var lines=File.ReadAllLines(state);
            if(lines.Length==6 && long.TryParse(lines[0],out end)) {
                sessionId=lines[1];mode=lines[2];sites=new HashSet<string>(lines[3].Split(new[]{','},StringSplitOptions.RemoveEmptyEntries));
                sound=lines[4]=="1";notice=lines[5]=="1";
            }
        }
        if(end!=0 && end<=Now)ClearSession();
        Text = "Concentra"; Width = 1024; Height = 780;
        Controls.Add(web);
        tray.DoubleClick += delegate { Reveal(); };
        var menu=new ContextMenuStrip();
        menu.Items.Add("Abrir Concentra",null,delegate { Reveal(); });
        menu.Items.Add("Salir",null,delegate {
            if(end>Now){
                Reveal();
                if(web.CoreWebView2!=null)web.CoreWebView2.ExecuteScriptAsync("document.getElementById('stop').click()");
                return;
            }
            Close();
        });
        tray.ContextMenuStrip=menu;
        tick.Tick += delegate {
            if (show.WaitOne(0)) Reveal();
            if (Now < end && mode != "normal") {
                var window=GetForegroundWindow();Restrict(window,selected);shield.Check(window,sites);
            } else if (end!=0 && Now>=end) {
                ClearSession();
                Alert(sound,notice,false);
            }
        };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (e.CloseReason == CloseReason.UserClosing && Now < end) {
                e.Cancel = true; tray.Visible = true; Hide();
            }
        };
        FormClosed += delegate { tick.Dispose(); shield.Dispose(); tray.Dispose(); menu.Dispose(); if(finishPopup!=null)finishPopup.Dispose(); };
        tick.Start();
        Shown += async delegate {
            try {
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(folder,"Web"));
                await web.EnsureCoreWebView2Async(env);
                var core = web.CoreWebView2;
                core.Settings.UserAgent += " ConcentraNative/1 ConcentraWindows/2";
                core.AddWebResourceRequestedFilter(Home+"*",CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += (s,e) => {
                    var uri=new Uri(e.Request.Uri);
                    string file=uri.AbsolutePath.Substring("/concentra/".Length);
                    if(file=="")file="index.html";
                    string type;
                    if(!WebFiles.TryGetValue(file,out type))return;
                    var resource=typeof(FocusWindow).Assembly.GetManifestResourceStream("site."+file);
                    if(resource!=null)e.Response=env.CreateWebResourceResponse(resource,200,"OK","Content-Type: "+type+"\r\nCache-Control: no-store");
                };
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
    static readonly Dictionary<string,string> WebFiles = new Dictionary<string,string> {
        {"index.html","text/html; charset=utf-8"},{"app.js","application/javascript"},{"style.css","text/css"},{"cuenta.js","application/javascript"},
        {"grupo.js","application/javascript"},{"perfil.js","application/javascript"},{"horario.js","application/javascript"},
        {"app.webmanifest","application/manifest+json"},{"icon.png","image/png"},{"timer-worker.js","application/javascript"}
    };
    void Alert(bool ring,bool popup,bool test) {
        if(ring){
            try {bell.Play();} catch(InvalidOperationException){System.Media.SystemSounds.Exclamation.Play();}
        }
        if(popup){
            tray.Visible=true;
            if(finishPopup!=null)finishPopup.Close();
            finishPopup=new FinishPopup(test?"Prueba de fin de Pomodoro":"¡Terminó tu Pomodoro!");
            finishPopup.Show();
        }
    }
    FinishPopup finishPopup;
    sealed class FinishPopup : Form {
        readonly System.Windows.Forms.Timer timeout=new System.Windows.Forms.Timer {Interval=15000};
        protected override bool ShowWithoutActivation {get{return true;}}
        protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p;}}
        public FinishPopup(string message) {
            Text="Concentra · Aviso";ShowInTaskbar=false;TopMost=true;StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.FixedToolWindow;
            ClientSize=new System.Drawing.Size(300,84);var desktop=Screen.FromPoint(Cursor.Position).WorkingArea;
            Location=new System.Drawing.Point(desktop.Right-Width-16,desktop.Bottom-Height-16);
            var label=new Label{Text=message,Dock=DockStyle.Fill,TextAlign=System.Drawing.ContentAlignment.MiddleCenter,Font=new System.Drawing.Font("Segoe UI",12)};
            Controls.Add(label);label.Click+=delegate{Close();};timeout.Tick+=delegate{Close();};FormClosed+=delegate{timeout.Dispose();};timeout.Start();
        }
    }
    readonly System.Media.SoundPlayer bell=new System.Media.SoundPlayer(typeof(FocusWindow).Assembly.GetManifestResourceStream("campana.wav"));
    void ClearSession(){
        end=0;sessionId="";mode="normal";shield.Release();
        try { Persist(); } catch(IOException) {} catch(UnauthorizedAccessException) {}
    }
    void Persist(){
        Write("sesion-v2.txt",new[]{end.ToString(),sessionId,mode,String.Join(",",sites),sound?"1":"0",notice?"1":"0"});
    }
    void Reveal() { Show(); WindowState = FormWindowState.Normal; Activate(); tray.Visible = false; }
    static bool Allowed(string path) {
        if (String.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path) || !File.Exists(path)) return false;
        string full = Path.GetFullPath(path);
        return full.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
            && !full.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.Windows) + "\\", StringComparison.OrdinalIgnoreCase)
            && !BrowserShield.IsBrowser(full)
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
        var parts=(command??"").Split(':');
        if(command=="status")return end>Now?end.ToString():"0";
        if(command=="activeId")return end>Now?sessionId:"";
        if(command=="programCount")return selected.Count.ToString();
        if(parts.Length==3 && parts[0]=="test") { Alert(parts[1]=="1",parts[2]=="1",true);return "OK"; }
        if(parts.Length==3 && parts[0]=="alerts") { sound=parts[1]=="1";notice=parts[2]=="1";Persist();return "OK"; }
        if(parts.Length==2 && parts[0]=="release") {
            if(end>Now && sessionId!=parts[1])return "Hay otro bloque activo en este PC.";
            ClearSession();return "OK";
        }
        if(command=="emergency") {
            if(MessageBox.Show("¿Liberar las aplicaciones de este PC ahora?",Text,MessageBoxButtons.YesNo)==DialogResult.Yes){ClearSession();return "OK";}
            return "Cancelado";
        }
        if(end>Now)return "Hay un bloque activo en este PC.";
        if(command=="choose"){BeginInvoke(new Action(Choose));return "OK";}
        long duration;
        if(parts.Length!=7 || parts[0]!="run" || !System.Text.RegularExpressions.Regex.IsMatch(parts[1],@"^[a-zA-Z0-9-]{1,80}$")
            || !long.TryParse(parts[2],out duration) || duration<1 || duration>10800000
            || !new[]{"normal","focus","strict"}.Contains(parts[3]))return "Duración o modo inválido.";
        var allowedSites=new[]{"instagram.com","tiktok.com","x.com","reddit.com","twitch.tv","youtube.com"};
        var choices=new HashSet<string>(parts[4].Split(',').Where(allowedSites.Contains));
        if(parts[3]!="normal" && choices.Count==0 && !selected.Any(Allowed))return "Elige sitios o programas en Bloqueo y avisos.";
        sessionId=parts[1];end=Now+duration;mode=parts[3];sites=choices;sound=parts[5]=="1";notice=parts[6]=="1";
        try {Persist();}catch{ClearSession();throw;}
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

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Automation;
using System.Windows.Forms;

// Only inspect the browser toolbar. Never descend into a web document.
sealed class BrowserShield : Form {
    static readonly HashSet<string> browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "chrome", "msedge" };
    internal static bool IsBrowser(string exe) { return browsers.Contains(System.IO.Path.GetFileNameWithoutExtension(exe)); }
    internal static bool Matches(string value, HashSet<string> sites) {
        Uri uri;
        if (String.IsNullOrWhiteSpace(value) || value.Contains(" ")) return false;
        if (!value.Contains("://")) value = "https://" + value;
        if (!Uri.TryCreate(value,UriKind.Absolute,out uri) || (uri.Scheme!="https" && uri.Scheme!="http")) return false;
        var host = uri.IdnHost.TrimEnd('.');
        foreach (var site in sites)
            if (host.Equals(site,StringComparison.OrdinalIgnoreCase) || host.EndsWith("."+site,StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect rect);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int id);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
    internal static AutomationElement FindBar(AutomationElement node,int depth) {
        if (depth>17) return null;
        var walker=TreeWalker.ControlViewWalker;
        for(var child=walker.GetFirstChild(node);child!=null;child=walker.GetNextSibling(child)) {
            var info=child.Current;
            if(info.ControlType==ControlType.Document || info.ClassName=="Chrome_RenderWidgetHostHWND" || info.ControlType==ControlType.TabItem) continue;
            if(info.ControlType==ControlType.Edit) {
                if(info.ClassName=="OmniboxViewViews" || info.AutomationId=="addressEditBox" || info.AcceleratorKey=="Ctrl+L")return child;
                continue;
            }
            var found=FindBar(child,depth+1);if(found!=null)return found;
        }
        return null;
    }
    internal sealed class Inspection {
        internal Rectangle Bounds;
        internal bool Matched, ReadBar;
    }
    internal static Inspection Inspect(IntPtr window,HashSet<string> sites) {
        var result=new Inspection();
        if(window==IntPtr.Zero || sites.Count==0)return result;
        int id; GetWindowThreadProcessId(window,out id);
        try {
            using(var p=Process.GetProcessById(id)) if(!browsers.Contains(p.ProcessName))return result;
            var bar=FindBar(AutomationElement.FromHandle(window),0);
            if(bar==null)return result;
            object value;
            if(!bar.TryGetCurrentPattern(ValuePattern.Pattern,out value))return result;
            result.ReadBar=true;
            if(!Matches(((ValuePattern)value).Current.Value,sites))return result;
            Rect win;
            if(!GetWindowRect(window,out win))return result;
            var boundary=bar.Current.BoundingRectangle;
            if(boundary.IsEmpty)return result;
            int top=(int)Math.Ceiling(boundary.Bottom)+3;
            if(top<=win.top || top>=win.bottom)return result;
            result.Bounds=Rectangle.FromLTRB(win.left,top,win.right,win.bottom);
            result.Matched=true;
        } catch(ElementNotAvailableException) {} catch(InvalidOperationException) {}
          catch(ArgumentException) {} catch(COMException) {} catch(Win32Exception) {}
        return result;
    }
    bool busy;
    int epoch;
    IntPtr lastWindow;
    readonly Func<IntPtr> currentWindow;
    internal BrowserShield(Func<IntPtr> currentWindow) {
        this.currentWindow=currentWindow;
        ShowInTaskbar=false;FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;TopMost=true;
        BackColor=Color.FromArgb(23,62,55);
        Controls.Add(new Label {Text="Sitio en pausa durante tu bloque\n\nCambia de pestaña o escribe otra dirección para seguir estudiando.",
            Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,ForeColor=Color.White,Font=new Font("Segoe UI",16)});
    }
    protected override bool ShowWithoutActivation {get{return true;}}
    protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p;}}
    internal void Release(){epoch++;lastWindow=IntPtr.Zero;if(Visible)Hide();}
    internal async void Check(IntPtr window,HashSet<string> sites) {
        if(window!=lastWindow){Release();lastWindow=window;}
        if(busy||window==IntPtr.Zero||sites.Count==0)return;
        int version=epoch;busy=true;
        try {
            var result=await Task.Run(()=>Inspect(window,sites));
            if(IsDisposed||version!=epoch||currentWindow()!=window)return;
            if(result.Matched){Bounds=result.Bounds;if(!Visible)Show();}
            else if(Visible)Hide();
        } catch(SystemException){if(!IsDisposed && Visible)Hide();}
        finally{busy=false;}
    }
}

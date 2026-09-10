using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

class BridgeInput {
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSE mouse; [FieldOffset(0)] public KEY key; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSE { public int dx, dy; public uint mouseData, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEY { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
    static HashSet<int> keys = new HashSet<int>();
    static HashSet<int> buttons = new HashSet<int>();
    static void Send(INPUT input) { SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT))); }
    static void Key(int code, bool down) {
        bool extended = (code >= 33 && code <= 46) || code == 163 || code == 165;
        Send(new INPUT { type = 1, data = new UNION { key = new KEY { scan = (ushort)MapVirtualKey((uint)code, 0), flags = 8u | (down ? 0u : 2u) | (extended ? 1u : 0u) } } });
        if (down) keys.Add(code); else keys.Remove(code);
    }
    static void Mouse(uint flags, int x, int y, uint wheel) { Send(new INPUT { type = 0, data = new UNION { mouse = new MOUSE { dx = x, dy = y, flags = flags, mouseData = wheel } } }); }
    static void Button(int button, bool down) {
        uint flag = button == 0 ? (down ? 2u : 4u) : button == 2 ? (down ? 8u : 16u) : (down ? 32u : 64u);
        Mouse(flag, 0, 0, 0); if (down) buttons.Add(button); else buttons.Remove(button);
    }
    static void Release() { foreach (int key in new List<int>(keys)) Key(key, false); foreach (int button in new List<int>(buttons)) Button(button, false); }
    static void Main() {
        try {
            string line;
            while ((line = Console.ReadLine()) != null) {
                string[] args = line.Split(' '); int a, b;
                if (args[0] == "release") { Release(); continue; }
                if (args.Length < 2 || !int.TryParse(args[1], out a)) continue;
                if (args[0] == "wheel") { Mouse(0x0800, 0, 0, unchecked((uint)Math.Max(-120, Math.Min(120, a)))); continue; }
                if (args.Length != 3 || !int.TryParse(args[2], out b)) continue;
                if (args[0] == "key" && a > 0 && a < 256) Key(a, b == 1);
                if (args[0] == "button" && a >= 0 && a <= 2) Button(a, b == 1);
                if (args[0] == "move") Mouse(1, Math.Max(-2000, Math.Min(2000, a)), Math.Max(-2000, Math.Min(2000, b)), 0);
            }
        } finally { Release(); }
    }
}

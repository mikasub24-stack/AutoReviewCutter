package vn.rung.ble;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Điều khiển máy rung BLE "YCM-BL001".
 *
 * Giao thức (giải mã từ btsnoop_hci.log):
 *   Service  0xAE3A
 *   Ghi      0xAE3B (write without response)
 *   Notify   0xAE3C
 *   Khởi tạo: AA AA AA AA AA
 *   Lệnh:     AA 01 XX CS   (XX = số mức dạng BCD, 00 = tắt; CS = tổng 3 byte đầu & 0xFF)
 */
@SuppressLint("MissingPermission")
public class MainActivity extends Activity implements SensorEventListener {

    private static final UUID SERVICE_UUID = uuid16(0xAE3A);
    private static final UUID WRITE_UUID = uuid16(0xAE3B);
    private static final UUID NOTIFY_UUID = uuid16(0xAE3C);
    private static final UUID CCCD_UUID = uuid16(0x2902);

    private static final int MAX_LEVEL = 20;
    private static final int REQ_PERM = 1;
    private static final int REQ_ENABLE_BT = 2;

    private static final int BLUE = 0xFF1E9BE6;
    private static final int BG = 0xFFF5F6F8;

    private final Handler ui = new Handler(Looper.getMainLooper());

    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeChar;
    private boolean scanning = false;
    private boolean ready = false;

    // Hàng đợi ghi: chỉ giữ lệnh mới nhất, gửi tuần tự.
    private final Object lock = new Object();
    private byte[] pending = null;
    private boolean busy = false;
    private long busySince = 0;

    private TextView status;
    private TextView levelText;
    private LinearLayout deviceList;
    private Button connectBtn;
    private SeekBar slider;
    private Switch shakeSwitch;
    private EditText rawInput;
    private final Set<String> seen = new HashSet<>();

    private SensorManager sensorManager;
    private float shakeLevel = 0f;
    private int lastSent = -1;
    private long lastSendTime = 0;

    private static UUID uuid16(int v) {
        return UUID.fromString(String.format("0000%04x-0000-1000-8000-00805f9b34fb", v));
    }

    // ---------------------------------------------------------------- UI

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(BG);
        if (Build.VERSION.SDK_INT >= 23) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        BluetoothManager bm = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = bm != null ? bm.getAdapter() : null;
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        root.setPadding(p, dp(24), p, dp(32));
        scroll.addView(root);

        // Thẻ kết nối
        LinearLayout hero = card(root, BLUE);
        TextView hi = text("Rung BLE", 26, Color.WHITE, true);
        hero.addView(hi);
        status = text("Chưa kết nối", 15, 0xDDFFFFFF, false);
        status.setPadding(0, dp(4), 0, dp(12));
        hero.addView(status);
        connectBtn = pillButton("Kết nối thiết bị", Color.WHITE, BLUE);
        connectBtn.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                if (gatt != null) disconnect();
                else startScanFlow();
            }
        });
        hero.addView(connectBtn);
        deviceList = new LinearLayout(this);
        deviceList.setOrientation(LinearLayout.VERTICAL);
        hero.addView(deviceList);

        // Nút dừng
        Button stop = pillButton("DỪNG RUNG", Color.WHITE, 0xFFE5484D);
        stop.setTextSize(18);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, dp(56));
        slp.topMargin = dp(16);
        root.addView(stop, slp);
        stop.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                shakeSwitch.setChecked(false);
                slider.setProgress(0);
                sendLevel(0, true);
            }
        });

        // Chế độ
        LinearLayout modes = card(root, Color.WHITE);
        modes.addView(sectionTitle("Chế độ", "My Model"));
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(5);
        for (int i = 1; i <= MAX_LEVEL; i++) {
            final int n = i;
            Button m = pillButton(String.valueOf(i), BLUE, 0xFFE8F3FC);
            GridLayout.LayoutParams glp = new GridLayout.LayoutParams(
                    GridLayout.spec(GridLayout.UNDEFINED, 1f), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            glp.width = 0;
            glp.height = dp(48);
            glp.setMargins(dp(4), dp(4), dp(4), dp(4));
            m.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) {
                    sendLevel(n, true);
                }
            });
            grid.addView(m, glp);
        }
        modes.addView(grid);

        // Trượt
        LinearLayout slide = card(root, Color.WHITE);
        slide.addView(sectionTitle("Trượt", "Sliding"));
        levelText = text("Mức: 0", 15, 0xFF555555, false);
        slide.addView(levelText);
        slider = new SeekBar(this);
        slider.setMax(MAX_LEVEL);
        slider.setPadding(dp(8), dp(16), dp(8), dp(16));
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int v, boolean fromUser) {
                if (fromUser) sendLevel(v, false);
            }
            public void onStartTrackingTouch(SeekBar s) { }
            public void onStopTrackingTouch(SeekBar s) {
                sendLevel(s.getProgress(), true);
            }
        });
        slide.addView(slider);

        // Lắc
        LinearLayout shake = card(root, Color.WHITE);
        shake.addView(sectionTitle("Lắc", "Shaking"));
        shakeSwitch = new Switch(this);
        shakeSwitch.setText("Lắc điện thoại để rung (lắc càng mạnh rung càng mạnh)");
        shakeSwitch.setTextSize(15);
        shakeSwitch.setPadding(0, dp(8), 0, dp(8));
        shakeSwitch.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            public void onCheckedChanged(CompoundButton c, boolean on) {
                setShake(on);
            }
        });
        shake.addView(shakeSwitch);

        // Lệnh thử
        LinearLayout raw = card(root, Color.WHITE);
        raw.addView(sectionTitle("Gửi lệnh thử", "Hex, ví dụ AA0104AF"));
        rawInput = new EditText(this);
        rawInput.setHint("AA0104AF");
        rawInput.setSingleLine(true);
        raw.addView(rawInput);
        Button sendRaw = pillButton("Gửi", BLUE, 0xFFE8F3FC);
        sendRaw.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                byte[] data = parseHex(rawInput.getText().toString());
                if (data == null || data.length == 0) toast("Hex không hợp lệ");
                else enqueue(data);
            }
        });
        raw.addView(sendRaw, new LinearLayout.LayoutParams(-1, dp(48)));

        setContentView(scroll);
    }

    private LinearLayout card(LinearLayout parent, int color) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        int p = dp(20);
        c.setPadding(p, p, p, p);
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(22));
        c.setBackground(g);
        c.setElevation(dp(2));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(16);
        parent.addView(c, lp);
        return c;
    }

    private View sectionTitle(String vi, String en) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(0, 0, 0, dp(8));
        l.addView(text(vi, 20, 0xFF111111, true));
        l.addView(text(en, 13, 0xFF888888, false));
        return l;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button pillButton(String label, int textColor, int bg) {
        Button btn = new Button(this);
        btn.setText(label);
        btn.setAllCaps(false);
        btn.setTextColor(textColor);
        btn.setTextSize(15);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setStateListAnimator(null);
        GradientDrawable g = new GradientDrawable();
        g.setColor(bg);
        g.setCornerRadius(dp(24));
        btn.setBackground(g);
        return btn;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void setStatus(final String s) {
        ui.post(new Runnable() {
            public void run() { status.setText(s); }
        });
    }

    private void toast(final String s) {
        ui.post(new Runnable() {
            public void run() { Toast.makeText(MainActivity.this, s, Toast.LENGTH_SHORT).show(); }
        });
    }

    // ---------------------------------------------------------------- Quyền & bật Bluetooth

    private void startScanFlow() {
        if (adapter == null) {
            toast("Máy không hỗ trợ Bluetooth");
            return;
        }
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.BLUETOOTH_SCAN);
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.BLUETOOTH_CONNECT);
        } else if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (!need.isEmpty()) {
            requestPermissions(need.toArray(new String[0]), REQ_PERM);
            return;
        }
        if (!adapter.isEnabled()) {
            startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQ_ENABLE_BT);
            return;
        }
        startScan();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != REQ_PERM) return;
        for (int r : res) {
            if (r != PackageManager.PERMISSION_GRANTED) {
                toast("Cần cấp quyền Bluetooth để kết nối");
                return;
            }
        }
        startScanFlow();
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_ENABLE_BT && result == RESULT_OK) startScan();
    }

    // ---------------------------------------------------------------- Quét

    private void startScan() {
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            toast("Hãy bật Bluetooth");
            return;
        }
        seen.clear();
        deviceList.removeAllViews();
        scanning = true;
        setStatus("Đang tìm thiết bị... (bật máy rung, để gần điện thoại)");
        connectBtn.setEnabled(false);
        ScanSettings st = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        scanner.startScan(null, st, scanCb);
        ui.postDelayed(new Runnable() {
            public void run() {
                if (scanning) {
                    stopScan();
                    if (gatt == null) {
                        setStatus(seen.isEmpty()
                                ? "Không tìm thấy. Thoát hẳn WeChat rồi thử lại."
                                : "Chọn thiết bị ở danh sách bên dưới");
                    }
                }
            }
        }, 10000);
    }

    private void stopScan() {
        if (!scanning) return;
        scanning = false;
        try {
            if (scanner != null) scanner.stopScan(scanCb);
        } catch (Exception ignored) { }
        ui.post(new Runnable() {
            public void run() { connectBtn.setEnabled(true); }
        });
    }

    private final ScanCallback scanCb = new ScanCallback() {
        @Override
        public void onScanResult(int type, final ScanResult r) {
            final BluetoothDevice d = r.getDevice();
            String name = d.getName();
            if (name == null && r.getScanRecord() != null) name = r.getScanRecord().getDeviceName();
            if (name == null || name.isEmpty()) return;
            if (!seen.add(d.getAddress())) return;
            final String n = name;
            final boolean likely = n.toUpperCase().startsWith("YCM");
            ui.post(new Runnable() {
                public void run() {
                    Button item = pillButton((likely ? "★ " : "") + n + "   (" + r.getRssi() + " dBm)",
                            likely ? BLUE : 0xFF333333, Color.WHITE);
                    item.setTextSize(14);
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(44));
                    lp.topMargin = dp(8);
                    item.setOnClickListener(new View.OnClickListener() {
                        public void onClick(View v) { connect(d, n); }
                    });
                    deviceList.addView(item, likely ? 0 : deviceList.getChildCount(), lp);
                }
            });
            if (likely) connect(d, n); // tự kết nối máy rung YCM
        }

        @Override
        public void onScanFailed(int errorCode) {
            scanning = false;
            setStatus("Quét lỗi (" + errorCode + "). Tắt/bật Bluetooth rồi thử lại.");
            ui.post(new Runnable() {
                public void run() { connectBtn.setEnabled(true); }
            });
        }
    };

    // ---------------------------------------------------------------- Kết nối GATT

    private void connect(final BluetoothDevice d, final String name) {
        if (gatt != null) return;
        stopScan();
        setStatus("Đang kết nối " + name + "...");
        ui.post(new Runnable() {
            public void run() {
                deviceList.removeAllViews();
                connectBtn.setText("Ngắt kết nối");
            }
        });
        if (Build.VERSION.SDK_INT >= 23) {
            gatt = d.connectGatt(this, false, gattCb, BluetoothDevice.TRANSPORT_LE);
        } else {
            gatt = d.connectGatt(this, false, gattCb);
        }
    }

    private void disconnect() {
        sendLevelNow(0);
        ui.postDelayed(new Runnable() {
            public void run() { closeGatt("Đã ngắt kết nối"); }
        }, 200);
    }

    private void closeGatt(String msg) {
        ready = false;
        writeChar = null;
        synchronized (lock) {
            busy = false;
            pending = null;
        }
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (Exception ignored) { }
            gatt = null;
        }
        setStatus(msg);
        ui.post(new Runnable() {
            public void run() {
                connectBtn.setText("Kết nối thiết bị");
                connectBtn.setEnabled(true);
            }
        });
    }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int st, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) {
                setStatus("Đã kết nối, đang đọc dịch vụ...");
                g.discoverServices();
            } else if (state == BluetoothProfile.STATE_DISCONNECTED) {
                ui.post(new Runnable() {
                    public void run() { closeGatt("Mất kết nối"); }
                });
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int st) {
            BluetoothGattCharacteristic w = null, n = null;
            BluetoothGattService s = g.getService(SERVICE_UUID);
            if (s != null) {
                w = s.getCharacteristic(WRITE_UUID);
                n = s.getCharacteristic(NOTIFY_UUID);
            }
            if (w == null) { // dự phòng: tìm đặc tính ghi bất kỳ
                for (BluetoothGattService sv : g.getServices()) {
                    for (BluetoothGattCharacteristic c : sv.getCharacteristics()) {
                        int pr = c.getProperties();
                        if ((pr & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0 && w == null) w = c;
                    }
                }
            }
            if (w == null) {
                setStatus("Không tìm thấy kênh điều khiển trên thiết bị này");
                return;
            }
            writeChar = w;
            writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            if (n != null) {
                g.setCharacteristicNotification(n, true);
                BluetoothGattDescriptor cccd = n.getDescriptor(CCCD_UUID);
                if (cccd != null) {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    if (g.writeDescriptor(cccd)) return; // tiếp tục ở onDescriptorWrite
                }
            }
            onReady();
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int st) {
            onReady();
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int st) {
            byte[] next;
            synchronized (lock) {
                next = pending;
                pending = null;
                busy = false;
            }
            if (next != null) enqueue(next);
        }
    };

    private void onReady() {
        if (ready) return;
        ready = true;
        enqueue(new byte[]{(byte) 0xAA, (byte) 0xAA, (byte) 0xAA, (byte) 0xAA, (byte) 0xAA});
        setStatus("● Đã kết nối – sẵn sàng");
        toast("Kết nối thành công");
    }

    // ---------------------------------------------------------------- Gửi lệnh

    private static byte[] packet(int level) {
        int bcd = ((level / 10) << 4) | (level % 10);
        int cs = (0xAA + 0x01 + bcd) & 0xFF;
        return new byte[]{(byte) 0xAA, 0x01, (byte) bcd, (byte) cs};
    }

    /** force=false: bỏ qua nếu trùng mức hoặc gửi quá dày (khi kéo thanh trượt / lắc). */
    private void sendLevel(int level, boolean force) {
        level = Math.max(0, Math.min(MAX_LEVEL, level));
        long now = SystemClock.uptimeMillis();
        if (!force && (level == lastSent || now - lastSendTime < 120)) return;
        sendLevelNow(level);
    }

    private void sendLevelNow(final int level) {
        lastSent = level;
        lastSendTime = SystemClock.uptimeMillis();
        ui.post(new Runnable() {
            public void run() { levelText.setText("Mức: " + level); }
        });
        enqueue(packet(level));
    }

    private void enqueue(byte[] data) {
        if (gatt == null || writeChar == null) {
            toast("Chưa kết nối thiết bị");
            return;
        }
        synchronized (lock) {
            long now = SystemClock.uptimeMillis();
            if (busy && now - busySince < 300) {
                pending = data; // giữ lệnh mới nhất
                return;
            }
            busy = true;
            busySince = now;
        }
        writeChar.setValue(data);
        if (!gatt.writeCharacteristic(writeChar)) {
            synchronized (lock) { busy = false; }
        }
    }

    private static byte[] parseHex(String s) {
        s = s.replaceAll("[^0-9a-fA-F]", "");
        if (s.length() % 2 != 0) return null;
        byte[] out = new byte[s.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    // ---------------------------------------------------------------- Lắc

    private final Runnable shakeDecay = new Runnable() {
        public void run() {
            shakeLevel *= 0.85f;
            if (shakeLevel < 0.5f) shakeLevel = 0f;
            sendLevel(Math.round(shakeLevel), false);
            ui.postDelayed(this, 150);
        }
    };

    private void setShake(boolean on) {
        Sensor acc = sensorManager != null ? sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) : null;
        if (on) {
            if (acc == null) {
                toast("Máy không có cảm biến gia tốc");
                shakeSwitch.setChecked(false);
                return;
            }
            shakeLevel = 0f;
            sensorManager.registerListener(this, acc, SensorManager.SENSOR_DELAY_GAME);
            ui.post(shakeDecay);
        } else {
            if (sensorManager != null) sensorManager.unregisterListener(this);
            ui.removeCallbacks(shakeDecay);
            if (gatt != null) sendLevel(0, true);
        }
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        float x = e.values[0], y = e.values[1], z = e.values[2];
        float g = (float) Math.sqrt(x * x + y * y + z * z) - SensorManager.GRAVITY_EARTH;
        float target = Math.abs(g) * 1.0f; // ~20 m/s² chênh lệch => mức tối đa
        if (target > shakeLevel) shakeLevel = Math.min(MAX_LEVEL, target);
    }

    @Override
    public void onAccuracyChanged(Sensor s, int a) { }

    @Override
    protected void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        ui.removeCallbacksAndMessages(null);
        stopScan();
        if (gatt != null) {
            if (writeChar != null) {
                writeChar.setValue(packet(0));
                gatt.writeCharacteristic(writeChar);
            }
            gatt.disconnect();
            gatt.close();
            gatt = null;
        }
        super.onDestroy();
    }
}

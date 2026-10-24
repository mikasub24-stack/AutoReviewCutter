package vn.mika.capkey;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Cấp key bản quyền Auto Studio / AnimStudio ngay trên điện thoại. Giao diện dựng bằng mã (không cần layout XML). */
public class MainActivity extends Activity {
    private static final int REQ_PICK = 11;
    private static final int C_BG = 0xFFF2F4F3, C_CARD = 0xFFFFFFFF, C_PRI = 0xFF0F766E, C_TEXT = 0xFF1F2937, C_MUTED = 0xFF6B7280,
            C_OK = 0xFF15803D, C_WARN = 0xFFB45309, C_BAD = 0xFFB91C1C, C_LINE = 0xFFD1D5DB;
    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ROOT);
    private static final Pattern MACHINE_RE = Pattern.compile("\\b[A-Za-z2-7]{4}-[A-Za-z2-7]{4}-[A-Za-z2-7]{4}-[A-Za-z2-7]{4}\\b");

    private SharedPreferences prefs;
    private byte[] secret;
    private LinearLayout root;
    private EditText etSecret;
    private EditText etMachine, etDays, etName;
    private TextView tvMachineHint;
    private RadioButton[] appBtns, planBtns;
    private LinearLayout resultCard, historyBox;
    private TextView tvResultInfo, tvResultKey;
    private License.Issued last;

    // ================================================================== vòng đời
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("capkey_app", MODE_PRIVATE);
        getWindow().setStatusBarColor(C_PRI);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        secret = Secret.has(this) ? Secret.load(this) : null;
        render();
    }

    private void render() {
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(C_BG);
        sv.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(16), dp(16), dp(32));
        sv.addView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(sv);
        if (Secret.has(this) && secret == null) {
            // đã có bản mã hóa nhưng không giải mã được (xóa dữ liệu / đổi khóa hệ thống) -> nhập lại
            Secret.clear(this);
        }
        if (secret == null) buildSetup();
        else buildMain();
    }

    // ================================================================== màn nhập khóa riêng
    private void buildSetup() {
        root.addView(title("Cấp key bản quyền"));
        root.addView(sub("Auto Studio · AnimStudio"));
        LinearLayout c = card();
        c.addView(label("Nhập khóa riêng (chỉ một lần)"));
        c.addView(note("Mở file private.key bằng trình soạn thảo văn bản, chép 64 ký tự rồi dán vào ô dưới — hoặc chọn thẳng file. "
                + "Khóa được mã hóa và giữ trong máy này. App không có quyền Internet và không sao lưu lên đám mây."));
        etSecret = edit("64 ký tự (0-9, a-f)", false);
        etSecret.setTypeface(Typeface.MONOSPACE);
        etSecret.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        etSecret.setMinLines(2);
        c.addView(etSecret, lp(0, 8, 0, 0));
        c.addView(button("Chọn file private.key", false, v -> pickFile()), lp(0, 12, 0, 0));
        c.addView(button("Lưu khóa", true, v -> importSecret(etSecret.getText().toString())), lp(0, 8, 0, 0));
        root.addView(c, lp(0, 16, 0, 0));
    }

    private void pickFile() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        try {
            startActivityForResult(i, REQ_PICK);
        } catch (Exception e) {
            toast("Máy không mở được hộp chọn file. Hãy dán 64 ký tự vào ô.");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_PICK || res != RESULT_OK || data == null || data.getData() == null) return;
        try {
            Uri u = data.getData();
            InputStream in = getContentResolver().openInputStream(u);
            if (in == null) throw new IllegalStateException("không mở được file");
            byte[] buf = new byte[8192];
            int n = 0, r;
            while (n < buf.length && (r = in.read(buf, n, buf.length - n)) > 0) n += r;
            in.close();
            String txt = new String(buf, 0, n, "UTF-8");
            if (etSecret != null) etSecret.setText(txt.trim());
            importSecret(txt);
        } catch (Exception e) {
            alert("Không đọc được file", String.valueOf(e.getMessage()));
        }
    }

    private void importSecret(String text) {
        Matcher m = Pattern.compile("(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])").matcher(text == null ? "" : text);
        if (!m.find()) {
            alert("Khóa chưa đúng", "Cần đúng 64 ký tự thập lục phân (0-9, a-f) — nội dung file private.key.");
            return;
        }
        byte[] sk = License.hex(m.group().toLowerCase(Locale.ROOT));
        if (!java.util.Arrays.equals(Ed25519.publicKey(sk), License.PUBLIC_KEY)) {
            alert("Khóa không khớp", "private.key này KHÔNG khớp khóa công khai trong Auto Studio / AnimStudio. Key tạo ra sẽ không dùng được. Kiểm tra lại đúng file private.key của bạn.");
            return;
        }
        try {
            Secret.save(this, sk);
        } catch (Exception e) {
            alert("Không lưu được khóa", String.valueOf(e.getMessage()));
            return;
        }
        secret = sk;
        toast("Đã lưu khóa riêng vào máy.");
        render();
    }

    // ================================================================== màn chính
    private void buildMain() {
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.addView(title("Cấp key bản quyền"));
        t.addView(sub("Auto Studio · AnimStudio"));
        head.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button more = button("Menu", false, v -> showMenu());
        head.addView(more, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(head);

        // ---- biểu mẫu
        LinearLayout f = card();
        f.addView(label("Phần mềm"));
        RadioGroup rgApp = new RadioGroup(this);
        rgApp.setOrientation(RadioGroup.HORIZONTAL);
        appBtns = new RadioButton[License.APPS.length];
        for (int i = 0; i < appBtns.length; i++) {
            appBtns[i] = radio(License.APPS[i].name);
            rgApp.addView(appBtns[i], new RadioGroup.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        }
        appBtns[0].setChecked(true);
        f.addView(rgApp);

        f.addView(label("Mã máy của khách"), lp(0, 14, 0, 0));
        LinearLayout mr = new LinearLayout(this);
        mr.setOrientation(LinearLayout.HORIZONTAL);
        mr.setGravity(Gravity.CENTER_VERTICAL);
        etMachine = edit("ABCD-EFGH-IJKL-MNOP", true);
        etMachine.setTypeface(Typeface.MONOSPACE);
        etMachine.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        mr.addView(etMachine, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams pasteLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pasteLp.setMargins(dp(8), 0, 0, 0);
        mr.addView(button("Dán", false, v -> pasteMachine()), pasteLp);
        f.addView(mr);
        tvMachineHint = note("");
        f.addView(tvMachineHint, lp(0, 4, 0, 0));
        etMachine.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) {}
            public void afterTextChanged(Editable s) { updateMachineHint(); }
        });
        updateMachineHint();

        f.addView(label("Gói"), lp(0, 14, 0, 0));
        RadioGroup rgPlan = new RadioGroup(this);
        rgPlan.setOrientation(RadioGroup.VERTICAL);
        planBtns = new RadioButton[License.PLANS.length];
        for (int i = 0; i < planBtns.length; i++) {
            planBtns[i] = radio(License.PLANS[i].label);
            rgPlan.addView(planBtns[i]);
        }
        planBtns[2].setChecked(true);                    // mặc định: gói năm
        f.addView(rgPlan);
        etDays = edit("Số ngày", true);
        etDays.setInputType(InputType.TYPE_CLASS_NUMBER);
        etDays.setVisibility(View.GONE);
        f.addView(etDays, lp(0, 4, 0, 0));
        rgPlan.setOnCheckedChangeListener((g, id) -> etDays.setVisibility(planBtns[4].isChecked() ? View.VISIBLE : View.GONE));

        f.addView(label("Tên khách / ghi chú (tuỳ chọn)"), lp(0, 14, 0, 0));
        etName = edit("Ví dụ: Nguyễn Văn A", true);
        etName.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        f.addView(etName, lp(0, 4, 0, 0));
        f.addView(button("TẠO KEY", true, v -> onIssue()), lp(0, 18, 0, 0));
        root.addView(f, lp(0, 16, 0, 0));

        // ---- kết quả
        resultCard = card();
        resultCard.setVisibility(View.GONE);
        resultCard.addView(label("Key vừa tạo"));
        tvResultInfo = note("");
        resultCard.addView(tvResultInfo, lp(0, 4, 0, 0));
        tvResultKey = new TextView(this);
        tvResultKey.setTypeface(Typeface.MONOSPACE);
        tvResultKey.setTextSize(13);
        tvResultKey.setTextColor(C_TEXT);
        tvResultKey.setTextIsSelectable(true);
        tvResultKey.setPadding(dp(10), dp(10), dp(10), dp(10));
        tvResultKey.setBackground(round(0xFFF3F4F6, C_LINE, 8));
        resultCard.addView(tvResultKey, lp(0, 8, 0, 0));
        LinearLayout rb = new LinearLayout(this);
        rb.setOrientation(LinearLayout.HORIZONTAL);
        rb.addView(button("Sao chép", true, v -> copyKey(last)), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        rb.addView(button("Gửi cho khách", false, v -> shareText(last.key)), lp2(8));
        resultCard.addView(rb, lp(0, 10, 0, 0));
        root.addView(resultCard, lp(0, 16, 0, 0));

        // ---- lịch sử
        historyBox = card();
        root.addView(historyBox, lp(0, 16, 0, 0));
        refreshHistory();
        if (last != null) showResult(last, false);
    }

    private void showMenu() {
        final String[] items = {"Chia sẻ danh sách key (CSV)", "Xóa lịch sử đã cấp", "Xóa khóa riêng khỏi máy"};
        new AlertDialog.Builder(this).setItems(items, (d, which) -> {
            if (which == 0) shareText(csv());
            else if (which == 1) confirm("Xóa lịch sử?", "Danh sách key đã cấp trên máy này sẽ mất (key đã gửi khách vẫn dùng bình thường).", () -> {
                prefs.edit().remove("h").apply();
                refreshHistory();
            });
            else confirm("Xóa khóa riêng?", "Khóa riêng sẽ bị xóa khỏi máy. Muốn cấp key tiếp phải nhập lại từ file private.key. Chắc chắn xóa?", () -> {
                Secret.clear(this);
                secret = null;
                last = null;
                render();
            });
        }).show();
    }

    // ================================================================== cấp key
    private static String extractMachine(String text) {
        if (License.parseMachineCode(text) != null) return text;
        Matcher m = MACHINE_RE.matcher(text == null ? "" : text);
        return m.find() ? m.group() : null;
    }

    private void updateMachineHint() {
        if (tvMachineHint == null || etMachine == null) return;
        String s = etMachine.getText().toString();
        if (License.isAnyMachine(s)) {
            tvMachineHint.setTextColor(C_WARN);
            tvMachineHint.setText("Để trống = key dùng cho MỌI máy (chỉ nên dùng để thử).");
        } else if (extractMachine(s) != null) {
            tvMachineHint.setTextColor(C_OK);
            tvMachineHint.setText("Mã máy hợp lệ.");
        } else {
            tvMachineHint.setTextColor(C_BAD);
            tvMachineHint.setText("Chưa đúng: cần đủ 16 ký tự A-Z / 2-7 (ví dụ ABCD-EFGH-IJKL-MNOP).");
        }
    }

    private void pasteMachine() {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData cd = cm.getPrimaryClip();
            String txt = cd != null && cd.getItemCount() > 0 ? String.valueOf(cd.getItemAt(0).coerceToText(this)) : "";
            String m = extractMachine(txt);
            if (m == null) {
                toast("Bộ nhớ tạm không có mã máy (dạng ABCD-EFGH-IJKL-MNOP).");
                return;
            }
            etMachine.setText(m.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            toast("Không đọc được bộ nhớ tạm.");
        }
    }

    private void onIssue() {
        final String mt = etMachine.getText().toString();
        if (License.isAnyMachine(mt)) {
            confirm("Key cho MỌI máy?", "Ô mã máy đang trống: key này chạy được trên bất kỳ máy nào. Chỉ nên dùng để thử. Vẫn tạo?", this::doIssue);
        } else {
            doIssue();
        }
    }

    private void doIssue() {
        try {
            License.App app = License.APPS[0];
            for (int i = 0; i < appBtns.length; i++) if (appBtns[i].isChecked()) app = License.APPS[i];
            License.Plan plan = License.PLANS[2];
            for (int i = 0; i < planBtns.length; i++) if (planBtns[i].isChecked()) plan = License.PLANS[i];
            int days = 0;
            if (plan.days == -1) {
                try {
                    days = Integer.parseInt(etDays.getText().toString().trim());
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("Nhập số ngày (số nguyên, ví dụ 45).");
                }
            }
            String mt = etMachine.getText().toString();
            String m = License.isAnyMachine(mt) ? "" : extractMachine(mt);
            if (m == null) m = mt;                       // để issue() báo lỗi đúng thông điệp
            License.Issued r = License.issue(app, secret, m, plan, days, etName.getText().toString(), LocalDate.now(), null);
            addHistory(r);
            last = r;
            showResult(r, true);
            refreshHistory();
        } catch (IllegalArgumentException e) {
            alert("Chưa tạo được key", e.getMessage());
        } catch (Exception e) {
            alert("Lỗi", String.valueOf(e.getMessage()));
        }
    }

    private static String infoLine(License.Issued r) {
        return r.appName + " · " + r.planLabel + " · " + (r.expiry == null ? "không hết hạn" : "hết hạn " + r.expiry.format(DMY))
                + "\nMáy: " + r.machineText + (r.name.isEmpty() ? "" : "\nKhách: " + r.name);
    }

    private void showResult(License.Issued r, boolean copy) {
        tvResultInfo.setText(infoLine(r));
        tvResultKey.setText(r.key);
        resultCard.setVisibility(View.VISIBLE);
        if (copy) {
            copyKey(r);
            root.post(() -> resultCard.requestRectangleOnScreen(new android.graphics.Rect(0, 0, resultCard.getWidth(), resultCard.getHeight()), false));
        }
    }

    // ================================================================== lịch sử
    private void addHistory(License.Issued r) {
        try {
            JSONArray old = new JSONArray(prefs.getString("h", "[]"));
            JSONArray nw = new JSONArray();
            JSONObject o = new JSONObject();
            o.put("d", r.issued.toString());
            o.put("n", r.name);
            o.put("m", r.machineText);
            o.put("a", r.appName);
            o.put("p", r.planLabel);
            o.put("e", r.expiry == null ? "" : r.expiry.toString());
            o.put("k", r.key);
            nw.put(o);
            for (int i = 0; i < old.length() && i < 499; i++) nw.put(old.get(i));
            prefs.edit().putString("h", nw.toString()).apply();
        } catch (Exception ignore) {
        }
    }

    private JSONArray history() {
        try {
            return new JSONArray(prefs.getString("h", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static String ymdToDmy(String s) {
        try {
            return LocalDate.parse(s).format(DMY);
        } catch (Exception e) {
            return s;
        }
    }

    private void refreshHistory() {
        if (historyBox == null) return;
        historyBox.removeAllViews();
        historyBox.addView(label("Đã cấp gần đây"));
        JSONArray h = history();
        if (h.length() == 0) {
            historyBox.addView(note("Chưa có key nào. Key tạo xong sẽ ghi lại ở đây (chỉ trên máy này)."), lp(0, 4, 0, 0));
            return;
        }
        for (int i = 0; i < h.length() && i < 30; i++) {
            final JSONObject o = h.optJSONObject(i);
            if (o == null) continue;
            TextView row = new TextView(this);
            row.setTextSize(14);
            row.setTextColor(C_TEXT);
            String who = o.optString("n").isEmpty() ? o.optString("m") : o.optString("n");
            row.setText(ymdToDmy(o.optString("d")) + " · " + who + "\n" + o.optString("a") + " · " + o.optString("p"));
            row.setPadding(0, dp(10), 0, dp(10));
            row.setOnClickListener(v -> showEntry(o));
            historyBox.addView(row);
            View line = new View(this);
            line.setBackgroundColor(0xFFE5E7EB);
            historyBox.addView(line, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        }
    }

    private void showEntry(JSONObject o) {
        final String key = o.optString("k");
        String exp = o.optString("e").isEmpty() ? "không hết hạn" : "hết hạn " + ymdToDmy(o.optString("e"));
        String msg = o.optString("a") + " · " + o.optString("p") + " · " + exp + "\nMáy: " + o.optString("m")
                + (o.optString("n").isEmpty() ? "" : "\nKhách: " + o.optString("n")) + "\nNgày cấp: " + ymdToDmy(o.optString("d")) + "\n\n" + key;
        new AlertDialog.Builder(this).setTitle("Key đã cấp").setMessage(msg)
                .setPositiveButton("Sao chép", (d, w) -> copyText(key))
                .setNeutralButton("Gửi", (d, w) -> shareText(key))
                .setNegativeButton("Đóng", null).show();
    }

    private String csv() {
        StringBuilder sb = new StringBuilder("ngay_cap,ten_khach,ma_may,goi,het_han,key\n");
        JSONArray h = history();
        for (int i = 0; i < h.length(); i++) {
            JSONObject o = h.optJSONObject(i);
            if (o == null) continue;
            sb.append(q(o.optString("d"))).append(',').append(q(o.optString("n"))).append(',').append(q(o.optString("m"))).append(',')
                    .append(q(o.optString("a") + " · " + o.optString("p"))).append(',')
                    .append(q(o.optString("e").isEmpty() ? "vinh vien" : o.optString("e"))).append(',').append(q(o.optString("k"))).append('\n');
        }
        return sb.toString();
    }

    private static String q(String s) {
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }

    // ================================================================== tiện ích
    private void copyKey(License.Issued r) {
        if (r != null) copyText(r.key);
    }

    private void copyText(String t) {
        try {
            ((ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("key", t));
            toast("Đã sao chép.");
        } catch (Exception e) {
            toast("Không sao chép được — hãy giữ vào key để chọn và sao chép.");
        }
    }

    private void shareText(String t) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, t);
        startActivity(Intent.createChooser(i, "Gửi"));
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    private void alert(String title, String msg) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(msg).setPositiveButton("Đóng", null).show();
    }

    private void confirm(String title, String msg, Runnable yes) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(msg)
                .setPositiveButton("Đồng ý", (d, w) -> yes.run()).setNegativeButton("Huỷ", null).show();
    }

    // ---- dựng giao diện
    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable round(int fill, int stroke, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(radiusDp));
        if (stroke != 0) g.setStroke(dp(1), stroke);
        return g;
    }

    private LinearLayout.LayoutParams lp(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }

    private LinearLayout.LayoutParams lp2(int leftDp) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p.setMargins(dp(leftDp), 0, 0, 0);
        return p;
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(16), dp(16), dp(16));
        c.setBackground(round(C_CARD, 0xFFE5E7EB, 14));
        return c;
    }

    private TextView title(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(22);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(C_TEXT);
        return t;
    }

    private TextView sub(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(13);
        t.setTextColor(C_MUTED);
        return t;
    }

    private TextView label(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(C_TEXT);
        return t;
    }

    private TextView note(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(13);
        t.setTextColor(C_MUTED);
        return t;
    }

    private RadioButton radio(String s) {
        RadioButton r = new RadioButton(this);
        r.setText(s);
        r.setTextSize(15);
        r.setTextColor(C_TEXT);
        return r;
    }

    private EditText edit(String hint, boolean singleLine) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextSize(15);
        e.setTextColor(C_TEXT);
        e.setHintTextColor(0xFF9CA3AF);
        e.setSingleLine(singleLine);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        e.setBackground(round(0xFFFAFAFA, C_LINE, 8));
        return e;
    }

    private Button button(String s, boolean primary, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(primary ? Color.WHITE : C_PRI);
        b.setBackground(primary ? round(C_PRI, 0, 10) : round(0xFFFFFFFF, C_PRI, 10));
        b.setStateListAnimator(null);
        b.setPadding(dp(16), dp(10), dp(16), dp(10));
        b.setOnClickListener(l);
        return b;
    }
}

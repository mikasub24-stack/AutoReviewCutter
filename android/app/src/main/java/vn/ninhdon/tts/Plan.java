package vn.ninhdon.tts;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Chia văn bản thành các đoạn đọc + khoảng nghỉ. Chuyển nguyên văn từ ninhdon/plan.py của Auto Studio (bản máy tính)
 * để hai bản chia câu giống hệt nhau.
 */
public final class Plan {
    private Plan() {}

    public static final class Item {
        public final boolean pause;   // true = khoảng nghỉ (giây), false = đoạn chữ
        public final String text;
        public final double seconds;

        private Item(boolean pause, String text, double seconds) {
            this.pause = pause;
            this.text = text;
            this.seconds = seconds;
        }

        static Item text(String s) { return new Item(false, s, 0); }
        static Item pause(double sec) { return new Item(true, null, sec); }

        @Override public String toString() {
            return pause ? String.format(Locale.ROOT, "pause(%s)", fmt(seconds)) : "text(" + text + ")";
        }
    }

    // \s của Python (chuỗi unicode) rộng hơn \s mặc định của Java -> liệt kê rõ để hai nền tảng giống nhau.
    private static final String WS = "[\\s\\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\u001C-\\u001F]";
    private static final Pattern SPLIT_SENT_LONG = Pattern.compile("(?<=[.!?\u2026;:])" + WS + "+");
    private static final Pattern SPLIT_SENT = Pattern.compile("(?<=[.!?\u2026])" + WS + "+");
    private static final Pattern TAG_PAUSE = Pattern.compile(
            "\\[" + WS + "*(?:ngh\u1ec9|ng\u1eaft|nghi|pause|break)" + WS + "*([0-9.,]+)" + WS + "*(?:s|gi\u00e2y)?" + WS + "*\\]",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern TAG_ANY = Pattern.compile("\\[[^\\[\\]]{1,30}\\]");
    private static final Pattern SPACES_TABS = Pattern.compile("[ \\t]+");
    private static final Pattern NEWLINES = Pattern.compile("\\n+");
    private static final Set<String> KEEP_TAGS = new HashSet<>(Arrays.asList(
            "[c\u01b0\u1eddi]", "[th\u1edf d\u00e0i]", "[h\u1eafng gi\u1ecdng]"));

    // ------------------------------------------------------------------ tiện ích kiểu Python

    static boolean isWs(char c) {
        return Character.isWhitespace(c) || Character.isSpaceChar(c) || c == '\u0085';
    }

    /** str.strip() của Python. */
    static String strip(String s) {
        int a = 0, b = s.length();
        while (a < b && isWs(s.charAt(a))) a++;
        while (b > a && isWs(s.charAt(b - 1))) b--;
        return s.substring(a, b);
    }

    private static List<String> splitKeepNonBlank(Pattern p, String s) {
        List<String> out = new ArrayList<>();
        for (String part : p.split(s, -1)) {
            if (!strip(part).isEmpty()) out.add(part);
        }
        return out;
    }

    // ------------------------------------------------------------------ chia câu

    /** split_text(text, limit) */
    public static List<String> splitText(String text, int limit) {
        text = SPACES_TABS.matcher(text.replace("\r", "")).replaceAll(" ");
        text = strip(text);
        List<String> parts = splitKeepNonBlank(SPLIT_SENT_LONG, text);
        List<String> chunks = new ArrayList<>();
        String cur = "";
        for (String p : parts) {
            while (p.length() > limit) {
                if (!cur.isEmpty()) {
                    chunks.add(cur);
                    cur = "";
                }
                int cut = Math.max(p.lastIndexOf(',', limit - 1), p.lastIndexOf(' ', limit - 1));
                cut = cut > 0 ? cut + 1 : limit;
                chunks.add(strip(p.substring(0, cut)));
                p = strip(p.substring(cut));
            }
            if (cur.length() + p.length() + 1 > limit) {
                if (!cur.isEmpty()) chunks.add(cur);
                cur = p;
            } else {
                cur = strip(cur + " " + p);
            }
        }
        if (!cur.isEmpty()) chunks.add(cur);
        return chunks;
    }

    /** merge_short(ss, mn=10): gộp câu quá ngắn (vd "Vâng.") vào câu kế tiếp. */
    public static List<String> mergeShort(List<String> ss, int mn) {
        List<String> out = new ArrayList<>();
        String carry = "";
        for (String x : ss) {
            if (!carry.isEmpty()) x = strip(carry + " " + x);
            if (x.length() < mn) {
                carry = x;
                continue;
            }
            out.add(x);
            carry = "";
        }
        if (!carry.isEmpty()) {
            if (!out.isEmpty()) out.set(out.size() - 1, out.get(out.size() - 1) + " " + carry);
            else out.add(carry);
        }
        return out;
    }

    // ------------------------------------------------------------------ kế hoạch

    /** build_plan(text, sent_pause, para_pause, limit) */
    public static List<Item> build(String text, double sentPause, double paraPause, int limit) {
        List<Item> plan = new ArrayList<>();

        // các đoạn (kind, văn bản | giây): 't' = chữ, 'p' = nghỉ theo ý người dùng
        List<Object[]> pieces = new ArrayList<>();
        int pos = 0;
        Matcher m = TAG_PAUSE.matcher(text);
        while (m.find()) {
            pieces.add(new Object[] {'t', text.substring(pos, m.start())});
            double sec = 0;
            try {
                sec = Double.parseDouble(m.group(1).replace(',', '.'));
            } catch (NumberFormatException ignored) {
                sec = 0;
            }
            pieces.add(new Object[] {'p', sec});
            pos = m.end();
        }
        pieces.add(new Object[] {'t', text.substring(pos)});

        for (Object[] piece : pieces) {
            if ((Character) piece[0] == 'p') {
                addPause(plan, (Double) piece[1]);
                continue;
            }
            String val = (String) piece[1];
            Matcher tm = TAG_ANY.matcher(val);
            StringBuffer sb = new StringBuffer();
            while (tm.find()) {
                String tag = tm.group(0);
                tm.appendReplacement(sb, Matcher.quoteReplacement(KEEP_TAGS.contains(tag.toLowerCase(Locale.ROOT)) ? tag : " "));
            }
            tm.appendTail(sb);
            val = sb.toString();

            for (String par0 : NEWLINES.split(val, -1)) {
                String par = strip(SPACES_TABS.matcher(par0).replaceAll(" "));
                if (par.isEmpty()) continue;
                List<String> sents = mergeShort(splitKeepNonBlank(SPLIT_SENT, par), 10);
                for (int k = 0; k < sents.size(); k++) {
                    for (String ch : splitText(sents.get(k), limit)) plan.add(Item.text(ch));
                    if (k < sents.size() - 1) addPause(plan, sentPause);
                }
                addPause(plan, paraPause);
            }
        }
        while (!plan.isEmpty() && plan.get(plan.size() - 1).pause) plan.remove(plan.size() - 1);
        return plan;
    }

    private static void addPause(List<Item> plan, double sec) {
        if (sec <= 0 || plan.isEmpty()) return;
        Item last = plan.get(plan.size() - 1);
        if (last.pause) plan.set(plan.size() - 1, Item.pause(last.seconds + sec));
        else plan.add(Item.pause(sec));
    }

    // ------------------------------------------------------------------ tên tệp

    private static final Pattern BAD_FN = Pattern.compile("[\\\\/:*?\"<>|\\x00-\\x1f]");
    private static final Pattern ANY_WS = Pattern.compile(WS + "+");
    private static final Pattern FIRST_SENT = Pattern.compile("^(.{6,}?[.!?\u2026])(" + WS + "|$)", Pattern.DOTALL);

    /** first_sentence_name(text, limit=60): lấy câu đầu làm tên tệp. */
    public static String firstSentenceName(String text, int limit) {
        String t = strip(ANY_WS.matcher(TAG_ANY.matcher(text).replaceAll(" ")).replaceAll(" "));
        Matcher m = FIRST_SENT.matcher(t);
        String sn = BAD_FN.matcher(m.find() ? m.group(1) : t).replaceAll("");
        sn = stripChars(sn, " .");
        if (sn.length() > limit) {
            String head = sn.substring(0, limit);
            int sp = head.lastIndexOf(' ');
            sn = head.indexOf(' ') >= 0 ? head.substring(0, sp) : head;
        }
        return stripChars(sn, " .");
    }

    /** s.strip(chars) của Python: bỏ các ký tự trong chars ở hai đầu. */
    static String stripChars(String s, String chars) {
        int a = 0, b = s.length();
        while (a < b && chars.indexOf(s.charAt(a)) >= 0) a++;
        while (b > a && chars.indexOf(s.charAt(b - 1)) >= 0) b--;
        return s.substring(a, b);
    }

    private static String fmt(double d) {
        return String.format(Locale.ROOT, "%.4f", d);
    }

    /** Dạng chuỗi ổn định để so với bản Python: T:<chữ> hoặc P:<giây 4 chữ số lẻ>, mỗi dòng một mục. */
    public static String dump(List<Item> plan) {
        StringBuilder sb = new StringBuilder();
        for (Item it : plan) {
            if (it.pause) sb.append("P:").append(fmt(it.seconds)).append('\n');
            else sb.append("T:").append(it.text.replace("\n", "\\n")).append('\n');
        }
        return sb.toString();
    }
}

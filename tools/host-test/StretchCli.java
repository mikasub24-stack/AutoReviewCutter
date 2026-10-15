import vn.ninhdon.tts.WavSpeed;
import java.io.File;

/** java StretchCli vao.wav ra.wav toc_do */
public class StretchCli {
    public static void main(String[] a) throws Exception {
        WavSpeed.convert(new File(a[0]), new File(a[1]), Double.parseDouble(a[2]), null, null);
    }
}

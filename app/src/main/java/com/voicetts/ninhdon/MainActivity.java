package com.voicetts.ninhdon;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.widget.*;
import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.ReturnCode;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
  EditText editor;
  TextView status;
  ProgressBar progress;
  Button make;
  TextToSpeech tts;
  boolean ready=false;
  volatile boolean busy=false;
  File mp3;
  Handler ui=new Handler(Looper.getMainLooper());

  public void onCreate(Bundle b){
    super.onCreate(b);
    LinearLayout root=new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(22,28,22,22);
    root.setBackgroundColor(0xff191923);
    TextView title=new TextView(this);
    title.setText("VOICE TTS  •  TIẾNG VIỆT");
    title.setTextSize(22);
    title.setTextColor(0xffffa2c5);
    root.addView(title);
    TextView info=new TextView(this);
    info.setText("Dán văn bản dài • tự chia đoạn • xuất một file MP3. Giọng đọc phụ thuộc bộ TTS đã cài trên máy.");
    info.setTextColor(Color.WHITE);
    info.setPadding(0,12,0,12);
    root.addView(info);
    editor=new EditText(this);
    editor.setHint("Dán toàn bộ nội dung cần đọc vào đây...");
    editor.setHintTextColor(0xffaaaaaa);
    editor.setTextColor(Color.WHITE);
    editor.setTextSize(16);
    editor.setGravity(48);
    editor.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xffffa2c5));
    root.addView(editor,new LinearLayout.LayoutParams(-1,0,1));
    make=new Button(this);
    make.setText("TẠO GIỌNG ĐỌC MP3");
    make.setOnClickListener(v->start());
    root.addView(make);
    progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
    progress.setMax(100);
    root.addView(progress);
    status=new TextView(this);
    status.setTextColor(Color.WHITE);
    status.setText("Đang khởi tạo giọng đọc...");
    root.addView(status);
    setContentView(root);
    tts=new TextToSpeech(this,code->{
      if(code==TextToSpeech.SUCCESS){
        int lang=tts.setLanguage(new Locale("vi","VN"));
        ready=(lang!=TextToSpeech.LANG_MISSING_DATA && lang!=TextToSpeech.LANG_NOT_SUPPORTED);
        tts.setSpeechRate(1.0f);
        show(ready?"Sẵn sàng. Dán văn bản và bấm tạo MP3.":"Thiếu giọng tiếng Việt. Hãy cài giọng Việt trong cài đặt TTS của Android.");
      }else show("Không khởi tạo được Text-to-Speech trên máy.");
    });
  }
  void show(String s){ui.post(()->status.setText(s));}
  void start(){
    if(busy)return;
    if(!ready){show("Chưa có bộ đọc tiếng Việt. Cài Speech Services by Google hoặc bộ TTS tiếng Việt.");return;}
    String text=editor.getText().toString().trim();
    if(text.isEmpty()){show("Hãy nhập văn bản trước.");return;}
    busy=true;make.setEnabled(false);progress.setProgress(0);
    new Thread(()->process(text)).start();
  }
  ArrayList<String> chunks(String s){
    ArrayList<String> out=new ArrayList<>();
    StringBuilder b=new StringBuilder();
    String[] words=s.replace("\r"," ").split("(?<=\\s)|(?=[.!?;。！？]\\s)");
    for(String w:words){
      if(w.length()>1800){
        if(b.length()>0){out.add(b.toString());b.setLength(0);}
        for(int i=0;i<w.length();i+=1800)out.add(w.substring(i,Math.min(i+1800,w.length())));
      }else{
        if(b.length()+w.length()>1800 && b.length()>0){out.add(b.toString());b.setLength(0);}
        b.append(w);
      }
    }
    if(b.length()>0)out.add(b.toString());
    return out;
  }
  static String quote(File f){return "'"+f.getAbsolutePath().replace("'","'\\''")+"'";}
  void process(String text){
    try{
      File dir=new File(getCacheDir(),"tts_"+System.currentTimeMillis());
      if(!dir.mkdirs())throw new IOException("Không tạo được thư mục tạm");
      ArrayList<String> parts=chunks(text);
      ArrayList<File> wavs=new ArrayList<>();
      for(int i=0;i<parts.size();i++){
        final int n=i;
        File wav=new File(dir,String.format(Locale.US,"part_%05d.wav",i));
        CountDownLatch done=new CountDownLatch(1);
        final String[] error={null};
        String id="tts_"+i+"_"+System.nanoTime();
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
          public void onStart(String utteranceId){}
          public void onDone(String utteranceId){if(id.equals(utteranceId))done.countDown();}
          public void onError(String utteranceId){if(id.equals(utteranceId)){error[0]="Lỗi tổng hợp giọng ở đoạn "+(n+1);done.countDown();}}
          public void onError(String utteranceId,int code){onError(utteranceId);}
        });
        int rc=tts.synthesizeToFile(parts.get(i),new Bundle(),wav,id);
        if(rc!=TextToSpeech.SUCCESS)throw new IOException("Không tạo được đoạn "+(i+1));
        if(!done.await(180,TimeUnit.SECONDS))throw new IOException("Hết thời gian chờ đoạn "+(i+1));
        if(error[0]!=null)throw new IOException(error[0]);
        if(!wav.exists()||wav.length()<44)throw new IOException("File âm thanh trống tại đoạn "+(i+1));
        wavs.add(wav);
        final int pct=(int)(85.0*(i+1)/parts.size());
        ui.post(()->progress.setProgress(pct));
        show("Đã đọc "+(i+1)+"/"+parts.size()+" đoạn");
      }
      File list=new File(dir,"concat.txt");
      try(FileOutputStream fos=new FileOutputStream(list)){
        for(File wav:wavs){
          String line="file "+quote(wav)+"\n";
          fos.write(line.getBytes(StandardCharsets.UTF_8));
        }
      }
      show("Đang ghép và mã hóa MP3...");
      mp3=new File(dir,"Voice_TTS.mp3");
      String cmd="-y -f concat -safe 0 -i "+quote(list)+" -vn -c:a libmp3lame -b:a 192k "+quote(mp3);
      com.arthenica.ffmpegkit.FFmpegSession session=FFmpegKit.execute(cmd);
      if(!ReturnCode.isSuccess(session.getReturnCode())||!mp3.exists()||mp3.length()<100)
        throw new IOException("Lỗi mã hóa MP3: "+session.getAllLogsAsString());
      ui.post(()->{progress.setProgress(100);show("Đã tạo MP3. Chọn nơi lưu file.");save();});
    }catch(Exception e){show("Lỗi: "+e.getMessage());}
    finally{busy=false;ui.post(()->make.setEnabled(true));}
  }
  void save(){
    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("audio/mpeg");
    i.putExtra(Intent.EXTRA_TITLE,"Voice_TTS.mp3");
    startActivityForResult(i,77);
  }
  protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==77&&result==RESULT_OK&&data!=null&&data.getData()!=null){
      try(InputStream in=new FileInputStream(mp3);OutputStream out=getContentResolver().openOutputStream(data.getData())){
        byte[] buf=new byte[65536];int n;
        while((n=in.read(buf))!=-1)out.write(buf,0,n);
        show("Đã lưu MP3 thành công.");
      }catch(Exception e){show("Không lưu được MP3: "+e.getMessage());}
    }
  }
  protected void onDestroy(){if(tts!=null){tts.stop();tts.shutdown();}super.onDestroy();}
}
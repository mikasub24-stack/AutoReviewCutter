// Cầu nối JNI giữa app Java (vn.ninhdon.tts.Native) và lõi nd:: (audio.cpp).
#include <jni.h>

#include <mutex>
#include <string>
#include <vector>

#include "ninhdon_core.h"

namespace {

std::mutex g_lock;
nd::Handle * g_handle = nullptr;
std::string g_error;
int g_sample_rate = 0;

std::string to_std(JNIEnv * env, jstring s) {
    if (s == nullptr) {
        return std::string();
    }
    const char * chars = env->GetStringUTFChars(s, nullptr);
    if (chars == nullptr) {
        return std::string();
    }
    std::string out(chars);
    env->ReleaseStringUTFChars(s, chars);
    return out;
}

}  // namespace

extern "C" {

// Trả về "" nếu thành công, ngược lại là thông báo lỗi.
JNIEXPORT jstring JNICALL Java_vn_ninhdon_tts_Native_nativeInit(JNIEnv * env, jobject, jstring model, jstring dict,
                                                                jstring g2p_lib, jint threads, jint talker_mb,
                                                                jint predictor_mb, jint decoder_mb) {
    std::lock_guard<std::mutex> guard(g_lock);
    nd::release(g_handle);
    g_handle = nullptr;
    nd::InitOptions opt;
    opt.model_path = to_std(env, model);
    opt.g2p_dict = to_std(env, dict);
    opt.g2p_library = to_std(env, g2p_lib);
    opt.threads = static_cast<int>(threads);
    opt.talker_ctx_mb = static_cast<int>(talker_mb);
    opt.predictor_ctx_mb = static_cast<int>(predictor_mb);
    opt.decoder_ctx_mb = static_cast<int>(decoder_mb);
    nd::Handle * h = nullptr;
    std::string err = nd::init(&h, opt);
    g_handle = h;
    return env->NewStringUTF(err.c_str());
}

// Trả về PCM mono 16-bit, hoặc null nếu lỗi (xem nativeLastError).
JNIEXPORT jshortArray JNICALL Java_vn_ninhdon_tts_Native_nativeSynth(JNIEnv * env, jobject, jstring text,
                                                                     jstring codes, jstring emb, jlong seed) {
    std::lock_guard<std::mutex> guard(g_lock);
    std::vector<int16_t> pcm;
    int rate = 0;
    std::string err = nd::synth(g_handle, to_std(env, text), to_std(env, codes), to_std(env, emb),
                                static_cast<int64_t>(seed), pcm, rate);
    if (!err.empty()) {
        g_error = err;
        return nullptr;
    }
    g_error.clear();
    g_sample_rate = rate;
    jshortArray arr = env->NewShortArray(static_cast<jsize>(pcm.size()));
    if (arr == nullptr) {
        g_error = "Het bo nho khi tao mang am thanh.";
        return nullptr;
    }
    env->SetShortArrayRegion(arr, 0, static_cast<jsize>(pcm.size()), reinterpret_cast<const jshort *>(pcm.data()));
    return arr;
}

JNIEXPORT jstring JNICALL Java_vn_ninhdon_tts_Native_nativeLastError(JNIEnv * env, jobject) {
    std::lock_guard<std::mutex> guard(g_lock);
    return env->NewStringUTF(g_error.c_str());
}

JNIEXPORT jint JNICALL Java_vn_ninhdon_tts_Native_nativeSampleRate(JNIEnv *, jobject) {
    std::lock_guard<std::mutex> guard(g_lock);
    return static_cast<jint>(g_sample_rate);
}

JNIEXPORT void JNICALL Java_vn_ninhdon_tts_Native_nativeRelease(JNIEnv *, jobject) {
    std::lock_guard<std::mutex> guard(g_lock);
    nd::release(g_handle);
    g_handle = nullptr;
}

JNIEXPORT jstring JNICALL Java_vn_ninhdon_tts_Native_nativeVersion(JNIEnv * env, jobject) {
    return env->NewStringUTF(nd::version().c_str());
}

}  // extern "C"

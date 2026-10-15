#include "ninhdon_core.h"

#include "audiocpp.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace nd {

struct Handle {
    audiocpp_registry * registry = nullptr;
    audiocpp_model * model = nullptr;
    audiocpp_session * session = nullptr;
};

namespace {

std::string describe(const char * what, audiocpp_status st) {
    std::string s = what;
    s += ": ";
    s += audiocpp_status_string(st);
    const char * detail = audiocpp_last_error();
    if (detail != nullptr && *detail != '\0') {
        s += " - ";
        s += detail;
    }
    return s;
}

}  // namespace

std::string init(Handle ** out, const InitOptions & opt) {
    *out = nullptr;
    if ((audiocpp_abi_version() >> 16) != AUDIOCPP_ABI_VERSION_MAJOR) {
        return "Thu vien audio.cpp khac phien ban ABI voi ung dung.";
    }
    Handle * h = new Handle();
    audiocpp_status st = audiocpp_registry_create(nullptr, &h->registry);
    if (st != AUDIOCPP_OK) {
        std::string e = describe("Khong tao duoc registry", st);
        release(h);
        return e;
    }

    audiocpp_model_config cfg = {"vieneu_v3_turbo", nullptr, nullptr, nullptr};
    st = audiocpp_model_load(h->registry, opt.model_path.c_str(), &cfg, nullptr, &h->model);
    if (st != AUDIOCPP_OK) {
        std::string e = describe("Khong nap duoc mo hinh", st);
        release(h);
        return e;
    }

    audiocpp_options * so = audiocpp_options_create();
    if (so == nullptr) {
        release(h);
        return "Khong tao duoc bang tuy chon.";
    }
    auto set = [&](const char * key, const std::string & value) {
        return audiocpp_options_set(so, key, value.c_str());
    };
    st = set("vieneu_v3_turbo.g2p_dict_file", opt.g2p_dict);
    if (st == AUDIOCPP_OK && !opt.g2p_library.empty()) {
        st = set("vieneu_v3_turbo.g2p_library", opt.g2p_library);
    }
    if (st == AUDIOCPP_OK) {
        st = set("vieneu_v3_turbo.talker_constant_context_mb", std::to_string(opt.talker_ctx_mb));
    }
    if (st == AUDIOCPP_OK) {
        st = set("vieneu_v3_turbo.code_predictor_constant_context_mb", std::to_string(opt.predictor_ctx_mb));
    }
    if (st == AUDIOCPP_OK) {
        st = set("vieneu_v3_turbo.speech_decoder_constant_context_mb", std::to_string(opt.decoder_ctx_mb));
    }
    if (st != AUDIOCPP_OK) {
        std::string e = describe("Dat tuy chon phien", st);
        audiocpp_options_free(so);
        release(h);
        return e;
    }

    audiocpp_backend_config bc = {"cpu", 0, std::max(1, opt.threads)};
    st = audiocpp_session_create(h->model, "tts", "offline", &bc, so, &h->session);
    audiocpp_options_free(so);
    if (st != AUDIOCPP_OK) {
        std::string e = describe("Khong tao duoc phien doc", st);
        release(h);
        return e;
    }
    *out = h;
    return "";
}

std::string synth(Handle * h,
                  const std::string & text,
                  const std::string & codes_file,
                  const std::string & embedding_file,
                  int64_t seed,
                  std::vector<int16_t> & pcm,
                  int & sample_rate) {
    pcm.clear();
    sample_rate = 0;
    if (h == nullptr || h->session == nullptr) {
        return "Chua nap mo hinh.";
    }
    audiocpp_request * rq = audiocpp_request_create();
    if (rq == nullptr) {
        return "Khong tao duoc yeu cau.";
    }
    audiocpp_status st = audiocpp_request_set_text(rq, text.c_str(), nullptr);
    if (st == AUDIOCPP_OK) {
        st = audiocpp_request_set_option(rq, "reference_codes_file", codes_file.c_str());
    }
    if (st == AUDIOCPP_OK) {
        st = audiocpp_request_set_option(rq, "speaker_embedding_file", embedding_file.c_str());
    }
    if (st == AUDIOCPP_OK && seed >= 0) {
        st = audiocpp_request_set_option(rq, "seed", std::to_string(seed).c_str());
    }
    if (st != AUDIOCPP_OK) {
        std::string e = describe("Dat yeu cau", st);
        audiocpp_request_free(rq);
        return e;
    }

    audiocpp_result * res = nullptr;
    st = audiocpp_session_run(h->session, rq, &res);
    if (st != AUDIOCPP_OK) {
        std::string e = describe("Doc van ban that bai", st);
        audiocpp_request_free(rq);
        audiocpp_result_free(res);
        return e;
    }

    const float * samples = nullptr;
    size_t frames = 0;
    int rate = 0;
    int channels = 0;
    st = audiocpp_result_audio(res, &samples, &frames, &rate, &channels);
    std::string error;
    if (st != AUDIOCPP_OK) {
        error = describe("Khong lay duoc am thanh", st);
    } else if (samples == nullptr || frames == 0 || channels <= 0 || rate <= 0) {
        error = "Mo hinh khong tao ra am thanh.";
    } else {
        pcm.resize(frames);
        for (size_t i = 0; i < frames; ++i) {
            float acc = 0.0f;
            for (int c = 0; c < channels; ++c) {
                acc += samples[i * static_cast<size_t>(channels) + static_cast<size_t>(c)];
            }
            float v = acc / static_cast<float>(channels);
            if (!(v == v)) {
                v = 0.0f;  // NaN
            }
            v = std::max(-1.0f, std::min(1.0f, v));
            pcm[i] = static_cast<int16_t>(std::lrintf(v * 32767.0f));
        }
        sample_rate = rate;
    }
    audiocpp_result_free(res);
    audiocpp_request_free(rq);
    return error;
}

void release(Handle * h) {
    if (h == nullptr) {
        return;
    }
    audiocpp_session_free(h->session);
    audiocpp_model_free(h->model);
    audiocpp_registry_free(h->registry);
    delete h;
}

std::string version() {
    const char * v = audiocpp_build_version();
    return v != nullptr ? std::string(v) : std::string("?");
}

}  // namespace nd

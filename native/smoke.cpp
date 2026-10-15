// Bài thử đầu-cuối trên máy tính (CI): dùng đúng lõi nd:: mà app Android dùng.
//   smoke <model.gguf> <sea_g2p.bin> <libsea_g2p_rs.so> <ref_codes.txt> <speaker.emb.txt> <out.wav> "<văn bản>" [threads]
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

#include "ninhdon_core.h"

static void write_wav(const std::string & path, const std::vector<int16_t> & pcm, int rate) {
    std::ofstream f(path, std::ios::binary);
    auto u32 = [&](uint32_t v) { f.write(reinterpret_cast<const char *>(&v), 4); };
    auto u16 = [&](uint16_t v) { f.write(reinterpret_cast<const char *>(&v), 2); };
    const uint32_t bytes = static_cast<uint32_t>(pcm.size() * 2);
    f.write("RIFF", 4);
    u32(36 + bytes);
    f.write("WAVEfmt ", 8);
    u32(16);
    u16(1);
    u16(1);
    u32(static_cast<uint32_t>(rate));
    u32(static_cast<uint32_t>(rate) * 2);
    u16(2);
    u16(16);
    f.write("data", 4);
    u32(bytes);
    f.write(reinterpret_cast<const char *>(pcm.data()), bytes);
}

int main(int argc, char ** argv) {
    if (argc < 8) {
        std::fprintf(stderr, "usage: smoke model dict g2plib codes emb out.wav text [threads]\n");
        return 2;
    }
    nd::InitOptions opt;
    opt.model_path = argv[1];
    opt.g2p_dict = argv[2];
    opt.g2p_library = argv[3];
    opt.threads = argc > 8 ? std::atoi(argv[8]) : 4;
    std::printf("audio.cpp %s\n", nd::version().c_str());

    auto t0 = std::chrono::steady_clock::now();
    nd::Handle * h = nullptr;
    std::string err = nd::init(&h, opt);
    if (!err.empty()) {
        std::fprintf(stderr, "INIT FAILED: %s\n", err.c_str());
        return 3;
    }
    auto t1 = std::chrono::steady_clock::now();
    std::printf("init: %.1f s\n", std::chrono::duration<double>(t1 - t0).count());

    std::vector<int16_t> pcm;
    int rate = 0;
    err = nd::synth(h, argv[7], argv[4], argv[5], 1234, pcm, rate);
    if (!err.empty()) {
        std::fprintf(stderr, "SYNTH FAILED: %s\n", err.c_str());
        nd::release(h);
        return 4;
    }
    auto t2 = std::chrono::steady_clock::now();
    const double wall = std::chrono::duration<double>(t2 - t1).count();
    const double dur = static_cast<double>(pcm.size()) / rate;
    double energy = 0.0;
    int peak = 0;
    for (int16_t s : pcm) {
        energy += static_cast<double>(s) * s;
        peak = std::max(peak, std::abs(static_cast<int>(s)));
    }
    const double rms = pcm.empty() ? 0.0 : std::sqrt(energy / pcm.size());
    std::printf("synth: %.1f s wall, audio %.2f s @ %d Hz, RTF %.2f, rms %.0f, peak %d\n", wall, dur, rate, wall / dur, rms,
                peak);
    write_wav(argv[6], pcm, rate);

    // lần 2: cùng phiên, kiểm tra tái sử dụng
    auto t3 = std::chrono::steady_clock::now();
    err = nd::synth(h, argv[7], argv[4], argv[5], 99, pcm, rate);
    auto t4 = std::chrono::steady_clock::now();
    std::printf("synth #2: %s, %.1f s wall\n", err.empty() ? "ok" : err.c_str(), std::chrono::duration<double>(t4 - t3).count());
    nd::release(h);

    if (dur < 0.5 || rms < 50.0) {
        std::fprintf(stderr, "SMOKE FAILED: audio is empty or silent\n");
        return 5;
    }
    std::printf("SMOKE OK\n");
    return 0;
}

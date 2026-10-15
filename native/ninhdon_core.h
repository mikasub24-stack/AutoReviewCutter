// Lõi gọi audio.cpp (VieNeu v3 Turbo) — dùng chung cho JNI (Android) và bài thử trên máy tính (smoke).
// Chỉ dùng C API công khai của audio.cpp (include/audiocpp.h). Không ném ngoại lệ ra ngoài: lỗi trả về dạng chuỗi.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace nd {

struct Handle;

struct InitOptions {
    std::string model_path;        // vieneu-v3-turbo-q8_0.gguf
    std::string g2p_dict;          // sea_g2p.bin
    std::string g2p_library;       // đường dẫn libsea_g2p_rs.so (để trống = tìm theo tên)
    int threads = 4;
    int talker_ctx_mb = 512;       // mặc định audio.cpp là 4096: quá lớn cho điện thoại
    int predictor_ctx_mb = 256;    // mặc định 1536
    int decoder_ctx_mb = 256;      // mặc định 1536
};

// Trả về "" nếu thành công, ngược lại là thông báo lỗi. *out luôn được gán (nullptr nếu lỗi).
std::string init(Handle ** out, const InitOptions & opt);

// Đọc văn bản -> PCM mono 16-bit. seed < 0 = ngẫu nhiên. Trả về "" nếu thành công.
std::string synth(Handle * h,
                  const std::string & text,
                  const std::string & codes_file,
                  const std::string & embedding_file,
                  int64_t seed,
                  std::vector<int16_t> & pcm,
                  int & sample_rate);

void release(Handle * h);

std::string version();

}  // namespace nd

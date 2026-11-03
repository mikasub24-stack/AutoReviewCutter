#pragma once
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
namespace vocal {
struct LiveKey {int tonic=-1;bool minor=false;double confidence=0;std::uint64_t generation=0,revision=0;};
struct LiveStatistics {std::uint64_t inputFrames=0,outputFrames=0,droppedFrames=0,underflows=0;std::size_t queuedFrames=0;};
// The browser's audio is intercepted before device playback. This stream never
// contains microphone or our own rendered output, so it cannot form loopback.
class LiveMusic {
public:
    LiveMusic();~LiveMusic();
    LiveMusic(const LiveMusic&)=delete;LiveMusic& operator=(const LiveMusic&)=delete;
    void start();void stop();
    std::size_t push(const float* const* channels,int numChannels,int frames) noexcept;
    void render(float* left,float* right,int frames,double outputRate) noexcept;
    void beginSong();
    void setSemitones(int) noexcept;
    int semitones() const noexcept;
    LiveKey key() const;
    LiveStatistics statistics() const noexcept;
    double processingLatencyMs() const noexcept;
    std::atomic<float> gain{.7f};
private:
    struct Impl;std::unique_ptr<Impl> impl;
};
}

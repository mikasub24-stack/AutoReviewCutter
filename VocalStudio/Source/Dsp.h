#pragma once
#include <array>
#include <cstddef>
#include <vector>

namespace vocal {
constexpr double pi = 3.14159265358979323846;
float dbToGain(float db) noexcept;
float gainToDb(float gain) noexcept;
struct VocalParameters {
    bool bypass = false;
    float inputDb = 0, highPassHz = 80, warmthDb = -2, presenceDb = 2;
    float thresholdDb = -18, ratio = 3, makeupDb = 2, deEss = .35f;
    float reverb = .10f, delay = .04f, delayMs = 240;
    float decaySeconds=1.2f,preDelayMs=20,damping=.65f,width=1,delayFeedback=.27f,deharsh=0;
};
VocalParameters preset(int index) noexcept;
std::vector<float> resampleBandlimited(const float*,std::size_t,double fromRate,double toRate);

class Biquad {
public:
    enum Type { highPass, lowPass, lowShelf, peak, bandPass };
    void configure(Type, double rate, double hz, double q, double db = 0) noexcept;
    float tick(float sample) noexcept;
    void reset() noexcept { z1 = z2 = 0; }
private:
    double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
};
class Delay {
public:
    void prepare(double rate, double maximumSeconds);
    void reset() noexcept;
    float tap(std::size_t samples) const noexcept;
    void push(float sample) noexcept;
    std::size_t capacity() const noexcept { return data.size(); }
private:
    std::vector<float> data;
    std::size_t cursor = 0;
};
class VocalChain {
public:
    void prepare(double sampleRate);
    void reset() noexcept;
    void setParameters(const VocalParameters&) noexcept;
    void process(float& left, float& right) noexcept;
    void processDry(float& left,float& right) noexcept;
    void processAmbience(float& left,float& right) noexcept;
    float gainReductionDb() const noexcept { return reduction; }
private:
    struct Channel {
        Biquad high, warmth, presence, ess, tame;
        Delay echo,preDelay;
        std::array<Delay, 4> comb;
        std::array<float, 4> damping {};
        std::array<Delay, 2> allpass;
    };
    std::array<Channel, 2> channels;
    VocalParameters p;
    double rate = 48000;
    float envelope = 0, essEnvelope = 0, compression = 1, reduction = 0;
    float preGain = 1, makeup = 1, attack = .99f, release = .999f, essRelease = .999f;
    std::size_t delaySamples = 1,preDelaySamples=1;
    std::array<float,4> roomFeedback{};
};
class Limiter {
public:
    void prepare(double sampleRate);
    void reset() noexcept;
    void process(float& left, float& right) noexcept;
    std::size_t latency() const noexcept { return lookahead; }
    float gainReductionDb() const noexcept { return -gainToDb(gain); }
private:
    std::array<Delay, 2> delay;
    std::size_t lookahead = 48, hold = 0;
    float gain = 1, recovery = .999f;
};
}

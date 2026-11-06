#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
// Native mono/stereo VST2 effects. No proprietary VST2 SDK is required.
std::unique_ptr<juce::AudioPluginFormat> createVst2Format();
juce::String checkVst2Binary(const juce::File&);

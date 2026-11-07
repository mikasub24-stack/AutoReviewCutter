#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
std::unique_ptr<juce::AudioPluginInstance> createBridgedVst2(const juce::File&,juce::String& error);

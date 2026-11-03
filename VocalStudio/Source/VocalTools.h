#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
class StudioMain;
juce::Component* createVocalTools(StudioMain&);

void refreshVocalTools(juce::Component&);

juce::Component* createSingerPanel(StudioMain&);
juce::Component* createAntaresPanel(StudioMain&);

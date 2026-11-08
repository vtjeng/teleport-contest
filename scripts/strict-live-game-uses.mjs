// Preloaded into every unit-test process by scripts/run-test-suite.mjs.
// js/gstate.js records a js/youprop.js macro given the wrong argument by
// default and lets the caller carry on, so that no entry point the judge
// drives can stop on it; tests select throwing instead, so a use fails the
// test that made it.
import { setPlanningUseRecording } from '../js/gstate.js';

setPlanningUseRecording(false);

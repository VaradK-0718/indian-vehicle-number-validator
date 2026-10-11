Indian Vehicle Registration Number Validator using Finite Automata

A frontend mini-project for the Formal Languages and Finite Automata FAFLcourse.  It shows how a Deterministic Finite Automaton (DFA) can validate an Indian vehicle registration number written in a simplified format.

Format: LLDDLLDDDD, where L is a letter A–Z and D is a digit 0–9. The last four digits must lie between 0001 and 9999. Example: MH12AB1234.

How it works: each character is classified (letter, zero, non-zero digit or other) and passed through the DFA transition table one step at a time. The string is accepted only if the DFA ends in the accepting state q10. Any invalid character, or the number 0000, sends it to the dead state qD. The result comes from the DFA transition function. The equivalent regular expression is shown only as the formal representation.

Features

Interactive DFA diagram, drawn with Cytoscape.js
Step-by-step simulation with start, pause, next-step and reset controls, and a speed slider
Highlighting of the current state and the transition being followed
Accepted or rejected result with a reason, such as the position of the error and the expected and received character types
Transition table and formal definition M = (Q, Σ, δ, q0, F)
Predefined valid and invalid test cases, plus custom input with a live character count

Built with: HTML5, CSS3, vanilla JavaScript(no backend)

Disclaimer: this is a format validator for learning DFA concepts. It is not an RTO or Parivahan verification system and does not check whether a vehicle exists. Real Indian registration formats vary by category and special series.

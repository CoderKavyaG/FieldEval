/**
 * MOCK DATA REPOSITORY
 * 
 * All simulated values and test fixtures reside strictly in this module.
 * No UI component contains embedded mock values or simulates AI responses directly.
 */

export interface MockScene {
  sceneNumber: number;
  totalScenes: number;
  title: string;
  category: string;
  instructions: string;
  question: string;
  inputType: 'choice' | 'stepper' | 'digits';
  options?: string[];
  shotVariant: 'Shot A' | 'Shot B';
  mockUserAnswer: string;
  mockModelAnswer: string;
  matched: boolean;
  tapeLabel: string;
  rationale: string;
  latencyMs: number;
  timestamp: string;
}

export const MOCK_SCENES: MockScene[] = [
  {
    sceneNumber: 1,
    totalScenes: 6,
    title: 'Find fresh leaves.',
    category: 'SPECIMEN COUNT',
    instructions: 'Five leaves or small stones spaced apart on a flat ground or table.',
    question: 'How many leaves are arranged on the table?',
    inputType: 'stepper',
    shotVariant: 'Shot A',
    mockUserAnswer: '5',
    mockModelAnswer: '5',
    matched: true,
    tapeLabel: 'MATCHED',
    rationale: 'Image displays five distinct green leaves spaced horizontally.',
    latencyMs: 3840,
    timestamp: 'Locked 13:58. Scored by exact integer match.',
  },
  {
    sceneNumber: 2,
    totalScenes: 6,
    title: 'Find standing water.',
    category: 'YOUR TASK',
    instructions: 'Any puddle, bowl or fountain. Frame it so the surface fills most of the shot.',
    question: 'Is it reflecting the sky?',
    inputType: 'choice',
    options: ['Yes', 'No', 'Unsure'],
    shotVariant: 'Shot A',
    mockUserAnswer: 'Yes',
    mockModelAnswer: 'No',
    matched: false,
    tapeLabel: 'MODEL SAID NO',
    rationale: 'Surface water exhibits heavy bottom shadow without specular blue zenith reflection.',
    latencyMs: 4120,
    timestamp: 'Locked 14:02. Scored by the rule set, not by feel.',
  },
  {
    sceneNumber: 3,
    totalScenes: 6,
    title: 'Find a surveyor tag.',
    category: 'IDENTIFIER CODE',
    instructions: 'A handwritten 4-digit code written on card stock beside a reference coin.',
    question: 'What 4-digit number is written on the tag?',
    inputType: 'digits',
    shotVariant: 'Shot A',
    mockUserAnswer: '7394',
    mockModelAnswer: '7394',
    matched: true,
    tapeLabel: 'MATCHED',
    rationale: 'Handwritten pen strokes clearly resolve to digits 7 3 9 4.',
    latencyMs: 5190,
    timestamp: 'Locked 14:07. Scored by exact 4-digit match.',
  },
  {
    sceneNumber: 4,
    totalScenes: 6,
    title: 'Negative presence.',
    category: 'NEGATIVE CONTROL',
    instructions: 'A featureless interior or exterior wall with no humans.',
    question: 'How many people are in this image?',
    inputType: 'stepper',
    shotVariant: 'Shot A',
    mockUserAnswer: '0',
    mockModelAnswer: '0',
    matched: true,
    tapeLabel: 'MATCHED',
    rationale: 'Clean painted plane without human figures or silhouettes.',
    latencyMs: 2980,
    timestamp: 'Locked 14:11. Scored by zero presence count.',
  },
  {
    sceneNumber: 5,
    totalScenes: 6,
    title: 'Check ground substrate.',
    category: 'CLASSIFICATION',
    instructions: 'Point camera downward 1 meter above soil, sand, or gravel.',
    question: 'What is the primary ground substrate?',
    inputType: 'choice',
    options: ['Gravel', 'Sand', 'Soil', 'Vegetation', 'Unsure'],
    shotVariant: 'Shot A',
    mockUserAnswer: 'Unsure',
    mockModelAnswer: 'Soil',
    matched: false,
    tapeLabel: 'EXCLUDED',
    rationale: 'User flagged unsure; observation excluded from scored benchmark.',
    latencyMs: 4430,
    timestamp: 'Locked 14:15. Marked unsure by researcher.',
  },
  {
    sceneNumber: 6,
    totalScenes: 6,
    title: 'Overhead canopy density.',
    category: 'ZENITH ANGLE',
    instructions: 'Point camera straight up through the tree canopy.',
    question: 'What is the overhead canopy coverage?',
    inputType: 'choice',
    options: ['Open (<20%)', 'Partial (20-60%)', 'Dense (>60%)'],
    shotVariant: 'Shot A',
    mockUserAnswer: 'Dense (>60%)',
    mockModelAnswer: 'Dense (>60%)',
    matched: true,
    tapeLabel: 'MATCHED',
    rationale: 'High foliage occlusion with sparse sky visibility.',
    latencyMs: 4610,
    timestamp: 'Locked 14:19. Scored by category match.',
  },
];

export interface MockTile {
  sceneNumber: number;
  status: 'match' | 'miss' | 'excluded';
  label: 'Match' | 'Miss' | 'Excluded';
}

export interface MockResultsData {
  headline: string;
  scoredCount: number;
  totalScenes: number;
  matchedCount: number;
  missedCount: number;
  excludedCount: number;
  tiles: MockTile[];
  statsCaption: string;
  wilsonInterval: [number, number];
}

export const MOCK_RESULTS: MockResultsData = {
  headline: 'Gemma matched you on 4 of 5 scored scenes.',
  scoredCount: 5,
  totalScenes: 6,
  matchedCount: 4,
  missedCount: 1,
  excludedCount: 1,
  tiles: [
    { sceneNumber: 1, status: 'match', label: 'Match' },
    { sceneNumber: 2, status: 'miss', label: 'Miss' },
    { sceneNumber: 3, status: 'match', label: 'Match' },
    { sceneNumber: 4, status: 'match', label: 'Match' },
    { sceneNumber: 5, status: 'excluded', label: 'Excluded' },
    { sceneNumber: 6, status: 'match', label: 'Match' },
  ],
  statsCaption:
    'Small sample. The 95% range for 4 of 5 is 38 to 96 percent. One scene was unsure and is not counted.',
  wilsonInterval: [0.378, 0.963],
};

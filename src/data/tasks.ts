import type { TaskDef } from '@/lib/schema';

// The client transmits only taskId over the network; prompts remain strictly server-side
const BASE_JSON_PROMPT =
  'Respond with ONLY valid JSON with keys: "answer" (string), "rationale" (string under 200 chars), and "self_confidence" (number between 0.0 and 1.0). Do not include formatting, thoughts, or markdown outside JSON.';

export const TASK_DECK: TaskDef[] = [
  {
    id: 'task-specimen-count',
    sceneNumber: 1,
    title: 'Specimen Count',
    question: 'How many leaves are arranged on the table? Integer only.',
    inputType: 'stepper',
    promptVersion: 'p1',
    promptTemplate: `${BASE_JSON_PROMPT}\nTask: Count the distinct specimen items on the surface. How many leaves are arranged on the table? Integer only.`,
    shots: [
      { shotIndex: 'A', instruction: 'Overhead flat lay', lighting: 'Direct overhead light' },
      { shotIndex: 'B', instruction: 'Low 45-degree angle', lighting: 'Side grazing light' },
    ],
  },
  {
    id: 'task-tag-number',
    sceneNumber: 2,
    title: 'Surveyor Tag Digits',
    question: 'What 4-digit number is inscribed on the tag? Digits only.',
    inputType: 'digits',
    promptVersion: 'p1',
    promptTemplate: `${BASE_JSON_PROMPT}\nTask: Read the handwritten or printed 4-digit numeric code on the card or tag. Digits only.`,
    shots: [
      { shotIndex: 'A', instruction: 'Frontal frame, coin reference', lighting: 'Diffused daylight' },
      { shotIndex: 'B', instruction: 'Tilted perspective, coin reference', lighting: 'High-contrast direct sun' },
    ],
  },
  {
    id: 'task-negative-control',
    sceneNumber: 3,
    title: 'Negative Presence',
    question: 'How many people are in this image? Integer only.',
    inputType: 'stepper',
    promptVersion: 'p1',
    promptTemplate: `${BASE_JSON_PROMPT}\nTask: Check for human presence. How many people are in this image? Integer only.`,
    shots: [
      { shotIndex: 'A', instruction: 'Wide framing on empty structure or wall', lighting: 'Ambient light' },
      { shotIndex: 'B', instruction: 'Close framing on featureless surface', lighting: 'Shadowed light' },
    ],
  },
  {
    id: 'task-dominant-substrate',
    sceneNumber: 4,
    title: 'Ground Substrate',
    question: 'What is the primary ground substrate in this frame?',
    inputType: 'choice',
    options: ['Gravel', 'Sand', 'Soil', 'Vegetation'],
    promptVersion: 'p1',
    promptTemplate: `${BASE_JSON_PROMPT}\nTask: Classify primary substrate into exactly one of: Gravel, Sand, Soil, Vegetation.`,
    shots: [
      { shotIndex: 'A', instruction: 'Downward view 1m distance', lighting: 'Direct midday sun' },
      { shotIndex: 'B', instruction: 'Downward view 1m distance', lighting: 'Deep canopy shadow' },
    ],
  },
  {
    id: 'task-flagging-color',
    sceneNumber: 5,
    title: 'Flagging Tape Color',
    question: 'What color is the surveyor flagging tape?',
    inputType: 'choice',
    options: ['Lime', 'Pink', 'Orange', 'Blue', 'None'],
    promptVersion: 'p1',
    promptTemplate: `${BASE_JSON_PROMPT}\nTask: Identify flagging marker tape color as Lime, Pink, Orange, Blue, or None.`,
    shots: [
      { shotIndex: 'A', instruction: 'Eye level, 1.5m distance', lighting: 'Front-lit daylight' },
      { shotIndex: 'B', instruction: 'Eye level, 1.5m distance', lighting: 'Back-lit backlight glare' },
    ],
  },
  {
    id: 'task-canopy-density',
    sceneNumber: 6,
    title: 'Canopy Density',
    question: 'What is the overhead canopy coverage?',
    inputType: 'choice',
    options: ['Open (<20%)', 'Partial (20-60%)', 'Dense (>60%)'],
    promptVersion: 'p1',
    promptTemplate: `${BASE_JSON_PROMPT}\nTask: Classify overhead canopy sky coverage into: Open (<20%), Partial (20-60%), or Dense (>60%).`,
    shots: [
      { shotIndex: 'A', instruction: 'Zenith pointed straight up', lighting: 'Clear sky' },
      { shotIndex: 'B', instruction: 'Zenith pointed straight up', lighting: 'Cloudy or dusk' },
    ],
  },
];

export function getTaskById(id: string): TaskDef | undefined {
  return TASK_DECK.find(task => task.id === id);
}

// Shared data types. Setting names match the training server (server/limits.py),
// so a Settings object can be sent to POST /train as it is.

export type SettingKey =
  | 'conv_blocks'
  | 'conv_layers_per_block'
  | 'dense_layers'
  | 'filters'
  | 'kernel_size'
  | 'dense_units'
  | 'dropout'
  | 'learning_rate'
  | 'epochs'
  | 'batch_norm'
  | 'batch_size'
  | 'train_images'
  | 'augmentation';

export interface Settings {
  conv_blocks: number;
  conv_layers_per_block: number;
  dense_layers: number;
  filters: number;
  kernel_size: number;
  dense_units: number;
  dropout: number;
  learning_rate: number;
  epochs: number;
  batch_norm: boolean;
  batch_size: number;
  train_images: number;
  augmentation: number;
}

export type SettingValue = number | boolean;

/** One finished epoch, as the server reports it (names turned into camelCase). */
export interface EpochPoint {
  /** 1 for the first epoch. */
  epoch: number;
  /** How many epochs the run was asked to do. */
  epochs: number;
  /** Train loss and accuracy (0..1). */
  loss: number;
  accuracy: number;
  /** Loss and accuracy on the 10,000 MNIST test images (0..1). */
  valLoss: number;
  valAccuracy: number;
  /** Seconds since training started. */
  seconds: number;
}

/** The numbers the server sends when a run is done. */
export interface RunResults {
  /** Share of the test images read correctly, 0..1. */
  testAccuracy: number;
  mistakes: number;
  testImages: number;
  /** Values of the last finished epoch. */
  loss: number;
  accuracy: number;
  valLoss: number;
  valAccuracy: number;
  /** Epochs that finished (can be fewer than asked). */
  epochs: number;
  trainingSeconds: number;
}

/** One bar chart of weight values: `bins` are counts scaled so the tallest is 1. */
export interface Histogram {
  lo: number;
  hi: number;
  bins: number[];
  count: number;
  mean: number;
  std: number;
}

export type WeightTag = 'kernel' | 'gamma' | 'beta' | 'moving_mean' | 'moving_variance' | 'bias';

export interface LayerHistogram {
  /** 'conv 1', 'conv 2', ..., 'dense', 'dense 2', 'output'. */
  name: string;
  kind: 'conv' | 'dense' | 'output';
  histogram: Histogram;
}

export interface TagHistogram {
  tag: WeightTag;
  histogram: Histogram;
}

/** What the browser works out from the weights of a trained model. */
export interface WeightAnalysis {
  /** Kernel weights of each conv and dense layer, in model order. */
  layers: LayerHistogram[];
  /** All weights with the same role, pooled over the layers. Only tags the model has. */
  tags: TagHistogram[];
  /** Share (0..1) of conv filters whose weights are all within 0.001 of zero. */
  deadFilterShare: number;
  /** True when the hidden dense weights form a bell around 0. Null when it cannot be told. */
  denseBell: boolean | null;
}

/** A finished training run, kept in memory for this tab. */
export interface RunRecord {
  /** The server's job id. */
  id: string;
  /** 1 for the first run in this tab, 2 for the next, ... */
  number: number;
  settings: Settings;
  epochs: EpochPoint[];
  results: RunResults;
  /** Null if the weights could not be read. */
  analysis: WeightAnalysis | null;
  /** Number of weights in the trained model. */
  params: number;
}

export type ModelSource = 'saved' | 'retrained';

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

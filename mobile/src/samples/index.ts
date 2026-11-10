import type { ExtractionResult } from '../extraction/types';
import { blurryImage, clearImage } from './images';
import blurry from './sample-bill-blurry.json';
import clear from './sample-bill.json';

/** Real results from FairBill's scanner on two sample photos, for trying the review flow without a server. */
export const SAMPLES = {
  clear: { result: clear as unknown as ExtractionResult, image: clearImage },
  blurry: { result: blurry as unknown as ExtractionResult, image: blurryImage },
};

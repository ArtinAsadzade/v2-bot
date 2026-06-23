import { runJobOnce } from "./runJobOnce";
import { PredictionService } from "../modules/prediction/prediction.service";

export async function runPredictionCloseJob() {
  return runJobOnce("prediction-close", () => PredictionService.closeExpired());
}

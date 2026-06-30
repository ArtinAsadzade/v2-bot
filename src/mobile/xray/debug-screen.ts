import { NativeXrayModuleSpec } from "./native-xray-module";
import { parseXrayUri } from "./parser";

export async function runXrayDebugSmoke(rawUri: string) {
  const config = parseXrayUri(rawUri);
  const stateBefore = await NativeXrayModuleSpec.getState();
  const startState = await NativeXrayModuleSpec.start({ config });
  const stats = await NativeXrayModuleSpec.getStats();
  return { stateBefore, startState, stats };
}

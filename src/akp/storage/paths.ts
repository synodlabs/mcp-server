import { homedir } from "os";
import { join }    from "path";

export const akpDir  = () => join(homedir(), ".synod");
export const akpPath = () => join(akpDir(), "akp.json");
export const devPath = () => join(akpDir(), ".device_id");

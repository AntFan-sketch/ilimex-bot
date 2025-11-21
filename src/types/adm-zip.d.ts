declare module "adm-zip" {
  export default class AdmZip {
    constructor(input?: string | Buffer);
    getEntry(path: string): {
      getData(): Buffer;
    } | null;
    // You can add more methods here if you need them later
  }
}

declare module "occt-import-js" {
  interface OcctInitOptions {
    locateFile?: (file: string) => string;
  }
  interface OcctModule {
    ReadStepFile: (data: Uint8Array, params: unknown) => any;
    ReadIgesFile: (data: Uint8Array, params: unknown) => any;
    ReadBrepFile: (data: Uint8Array, params: unknown) => any;
  }
  const factory: (options?: OcctInitOptions) => Promise<OcctModule>;
  export default factory;
}

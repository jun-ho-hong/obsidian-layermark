export type FabricSerializableObject = {
  toObject: (propertiesToInclude?: string[]) => Record<string, unknown>;
  get?: (property: string) => unknown;
};

export type FabricSceneJson = {
  version: string;
  objects: Record<string, unknown>[];
};

export const SKITCH_FABRIC_PROPERTIES = ["skitchRole", "skitchKind", "skitchBadgeId", "skitchBadgePart"];

export function serializeFabricScene(objects: FabricSerializableObject[]): FabricSceneJson {
  const serialized: Record<string, unknown>[] = [];
  for (const object of objects) {
    if (object.get?.("skitchRole") === "background") {
      continue;
    }
    try {
      serialized.push(object.toObject(SKITCH_FABRIC_PROPERTIES));
    } catch (error) {
      console.warn("Skipping unserializable Skitch annotation object", error);
    }
  }
  return {
    version: "7.4.0",
    objects: serialized
  };
}

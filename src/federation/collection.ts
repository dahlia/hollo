import {
  type Object as APObject,
  type Collection,
  type DocumentLoader,
  Link,
} from "@fedify/fedify";

export interface IterateCollectionOptions {
  documentLoader?: DocumentLoader;
  contextLoader?: DocumentLoader;
  suppressError?: boolean;
}

export async function* iterateCollection(
  collection: Collection,
  options?: IterateCollectionOptions,
): AsyncIterable<APObject> {
  if (collection.firstId == null) {
    for await (const item of collection.getItems(options)) {
      if (item instanceof Link) continue;
      yield item;
    }
    return;
  }
  let part = await collection.getFirst(options);
  while (part != null && !(part instanceof Link)) {
    for await (const item of part.getItems(options)) {
      if (item instanceof Link) continue;
      yield item;
    }
    part = await part.getNext(options);
  }
}

import { expect, test } from "bun:test";
import { Object as APObject, Collection } from "@fedify/fedify";
import { iterateCollection } from './collection';

test("iteration over empty Collection", async () => {
  const result: APObject[] = [];
  for await (const item of iterateCollection(new Collection({}))) {
    result.push(item);
  }
  expect(result).toEqual([]);
});

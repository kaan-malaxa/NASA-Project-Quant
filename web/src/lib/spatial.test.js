import { expect, it } from "vitest";
import { spatialAreaSeries, spatialMap } from "./spatial.js";

it("preserves authoritative outage fills, bounds, covered zeroes and missing bins", () => {
  const shard = {year:2020,series:["harmonized"],cells:["A","B"],monthly:[[0,8,0,12,10,14],[1,8,0,8,7,9]],
    monthly_bins:[{month:8,series:0,value:20,kind:"harmonized",source:"snpp"},{month:9,series:0,value:null,kind:"missing",source:null}]};
  expect(spatialAreaSeries({shards:[shard],cells:["A","B"]})[0]).toMatchObject({value:20,lo:17,hi:23,kind:"harmonized"});
  expect(spatialAreaSeries({shards:[shard],cells:["empty"]})[0].value).toBe(0);
  expect(spatialAreaSeries({shards:[shard],cells:["A"]})[1]).toMatchObject({value:null,kind:"missing"});
});

it("keeps an uncovered map year unavailable", () => {
  const result = spatialMap([{year:2020,series:["harmonized"],cells:[],monthly:[],weekly:[],monthly_bins:[],weekly_bins:[]}], "harmonized", [1]);
  expect(result.cells).toEqual([]);
});

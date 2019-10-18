const filterBlock = ({ x, y, z, maxZoomLevel, table, geometry }) =>
    `   (SELECT ${table}.${geometry}
    FROM ${table}
    WHERE ST_Intersects(TileDoubleBBox(${z}, ${x}, ${y}, 3857), ST_Transform(${table}.${geometry}, 3857))
    ),
    clustered as
    (SELECT unnest(ST_ClusterWithin(wkb_geometry, 0.006)) as clusters
    FROM filtered),
    clusters_with_meta_${maxZoomLevel} as
    (SELECT ST_Centroid(ST_CollectionExtract(clusters, 1)) as center,
            ST_NumGeometries(clusters) as theCount
    FROM clustered),`;

const clustered_query = ({ filterBlock, additionalLevels, z, x, y }) => `
with filtered AS
    ${filterBlock}
    ${additionalLevels}
     tiled as
    (SELECT center,
            theCount
     FROM clusters_with_meta_${z}
     WHERE ST_Intersects(TileBBox(${z}, ${x}, ${y}, 3857), ST_Transform(center, 3857))),
     q as
    (SELECT 1 as c1,
            ST_AsMVTGeom(ST_Transform(center, 3857), TileBBox(${z}, ${x}, ${y}, 3857), 256, 10, false) AS geom,
            theCount
     FROM tiled)
SELECT ST_AsMVT(q, 'stations', 256, 'geom') as mvt
from q
`;

const additionalLevel = zoomLevel => `
    clustered_${zoomLevel} as
    (SELECT unnest(ST_ClusterWithin(center, ${zoomToDistance(
        zoomLevel
    )})) as clusters
     FROM clusters_with_meta_${zoomLevel + 1}),
     clusters_with_meta_${zoomLevel} as
    (SELECT ST_Centroid(ST_CollectionExtract(clusters, 1)) as center,
            ST_NumGeometries(clusters) as theCount
     FROM clustered_${zoomLevel}),
`;

const zoomToDistance = zoomLevel => 10 / (zoomLevel * zoomLevel);

function createQueryForTile({ z, x, y, maxZoomLevel, table, geometry }) {
    if (z < maxZoomLevel) {
        let additionalLevels = '';
        for (let i = maxZoomLevel - 1; i >= z; --i) {
            additionalLevels += additionalLevel(i);
        }
        const ret = clustered_query({
            filterBlock: filterBlock({ z, x, y, maxZoomLevel, table, geometry }),
            z,
            x,
            y,
            additionalLevels,
        });
        return ret;
    } else {
        // TODO Implement unclustered query
    }
}

module.exports = {
    createQueryForTile,
    zoomToDistance,
};

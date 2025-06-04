import * as geoip from 'geoip-lite';

interface GeoLocationDetails {
    country: string | null;
    region: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
    ipAddress: string;
}

function hasIpChanged(sourceIp: string, targetIp: string): boolean {
    const sourceGeoInfo = geoip.lookup(sourceIp);
    const targetGeoInfo = geoip.lookup(targetIp);

    if (!sourceGeoInfo || !targetGeoInfo) {
        return false;
    }

    return sourceGeoInfo.country !== targetGeoInfo.country;
    // const isInDifferentCity = sourceGeoInfo.city !== targetGeoInfo.city;

    // return isInDifferentCountry || isInDifferentCity;
}

function getGeolocationDetails(ipAddress: string): GeoLocationDetails | null {
    const geoData = geoip.lookup(ipAddress);

    if (geoData) {
        return {
            country: geoData.country || null,
            region: geoData.region || null,
            city: geoData.city || null,
            latitude: geoData.ll ? geoData.ll[0] : null,
            longitude: geoData.ll ? geoData.ll[1] : null,
            timezone: geoData.timezone || null,
            ipAddress: ipAddress,
        };
    }

    return null;
}

export default {
    hasIpChanged,
    getGeolocationDetails
}

let map;
let currentLocationMarker;
let directionsService;
let directionsRenderer;
let currentLocation;

function initMap() {
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();

    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 12,
        center: { lat: 35.682839, lng: 139.759455 } // 初期表示: 東京駅
    });
    directionsRenderer.setMap(map);
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition, showError);
    } else {
        document.getElementById("nearest-station-result").innerText = "Geolocation is not supported by this browser.";
    }
}

function showPosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    currentLocation = new google.maps.LatLng(lat, lng);

    if (currentLocationMarker) {
        currentLocationMarker.setMap(null);
    }

    currentLocationMarker = new google.maps.Marker({
        position: currentLocation,
        map: map,
        title: "現在地"
    });

    map.setCenter(currentLocation);

    findNearestStation(lat, lng);
}

function showError(error) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            document.getElementById("nearest-station-result").innerText = "ユーザーが位置情報の取得を拒否しました。";
            break;
        case error.POSITION_UNAVAILABLE:
            document.getElementById("nearest-station-result").innerText = "位置情報が利用できません。";
            break;
        case error.TIMEOUT:
            document.getElementById("nearest-station-result").innerText = "位置情報の取得がタイムアウトしました。";
            break;
        case error.UNKNOWN_ERROR:
            document.getElementById("nearest-station-result").innerText = "不明なエラーが発生しました。";
            break;
    }
}

function findNearestStation(lat, lng) {
    const request = {
        location: { lat: lat, lng: lng },
        radius: '5000',
        type: ['train_station']
    };

    const service = new google.maps.places.PlacesService(map);
    service.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            if (results.length > 0) {
                const nearestStation = getNearestStation(results, lat, lng);
                displayNearestStation(nearestStation);
            } else {
                document.getElementById("nearest-station-result").innerText = '周辺に駅が見つかりませんでした。';
            }
        } else {
            document.getElementById("nearest-station-result").innerText = 'エラーが発生しました。';
        }
    });
}

function getNearestStation(stations, currentLat, currentLng) {
    return stations
        .map(station => ({
            ...station,
            distance: getDistance(currentLat, currentLng, station.geometry.location.lat(), station.geometry.location.lng())
        }))
        .sort((a, b) => a.distance - b.distance)[0];
}

function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球の半径 (km)
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function displayNearestStation(station) {
    const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(station.name)}`;
    document.getElementById("nearest-station-result").innerHTML = `現在地の最寄り駅: <a href="${link}" target="_blank">${station.name}</a> (距離: ${station.distance.toFixed(2)} km)`;
}

function findNearestStationsFromHome() {
    const homeStation = document.getElementById("home-station").value;
    if (!homeStation) {
        alert("自宅の最寄り駅を入力してください。");
        return;
    }

    const homeStationRequest = {
        query: homeStation,
        fields: ['place_id', 'geometry', 'name']
    };

    const service = new google.maps.places.PlacesService(map);
    service.findPlaceFromQuery(homeStationRequest, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
            const homeStationLat = results[0].geometry.location.lat();
            const homeStationLng = results[0].geometry.location.lng();

            const request = {
                location: { lat: homeStationLat, lng: homeStationLng },
                radius: '5000',
                type: ['train_station']
            };

            service.nearbySearch(request, (stations, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    const sortedStations = sortByProximityToHome(stations, homeStationLat, homeStationLng);
                    displayAlternativeStations(sortedStations);
                    getTaxiFareToHomeStation(); // 自宅の最寄り駅までのタクシー料金を計算
                } else {
                    document.getElementById("alternative-stations").innerHTML = 'エラーが発生しました。';
                }
            });
        } else {
            document.getElementById("alternative-stations").innerHTML = '自宅の最寄り駅が見つかりませんでした。';
        }
    });
}

function sortByProximityToHome(stations, homeLat, homeLng) {
    return stations
        .map(station => ({
            ...station,
            distance: getDistance(homeLat, homeLng, station.geometry.location.lat(), station.geometry.location.lng())
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
}

function displayAlternativeStations(stations) {
    const list = document.getElementById("alternative-stations");
    list.innerHTML = '';
    stations.forEach((station, index) => {
        const rank = index + 1;
        const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(station.name)}`;
        const listItem = document.createElement("li");
        listItem.innerHTML = `${rank}位: <a href="${link}" target="_blank">${station.name}</a> (距離: ${station.distance.toFixed(2)} km)`;
        list.appendChild(listItem);
    });
}

let taxiFarePerKm = 300; // 1kmあたりの料金（例）

function calculateTaxiFare(distance) {
    return Math.round(distance * taxiFarePerKm);
}

function getTaxiFareToHomeStation() {
    const homeStation = document.getElementById("home-station").value;
    if (!homeStation || !currentLocation) {
        alert("自宅の最寄り駅と現在地を取得してください。");
        return;
    }

    const homeStationRequest = {
        query: homeStation,
        fields: ['place_id', 'geometry']
    };

    const service = new google.maps.places.PlacesService(map);
    service.findPlaceFromQuery(homeStationRequest, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
            const homeStationLat = results[0].geometry.location.lat();
            const homeStationLng = results[0].geometry.location.lng();

            const request = {
                origin: currentLocation,
                destination: { lat: homeStationLat, lng: homeStationLng },
                travelMode: 'DRIVING'
            };

            directionsService.route(request, (response, status) => {
                if (status === google.maps.DirectionsStatus.OK) {
                    const distance = response.routes[0].legs[0].distance.value / 1000; // 距離をkmに変換
                    const fare = calculateTaxiFare(distance);
                    displayTaxiFare(fare);
                } else {
                    document.getElementById("fare-result").innerText = '料金計算に失敗しました。';
                }
            });
        } else {
            document.getElementById("fare-result").innerText = '自宅の最寄り駅が見つかりませんでした。';
        }
    });
}

function displayTaxiFare(fare) {
    document.getElementById("fare-result").innerText = `【${fare}円】分、浪費せずに済みました`;
}

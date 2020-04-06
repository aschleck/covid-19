import generator

class Assigner(object):
    def assign(self, id):
        return 'us'

def filter(polygon, id, group):
    return True

def translate(point, id, group):
    lat = point['lat']

    # Alaska straddles the antimeridian, so move it over a bit.
    if point['lng'] > 25:
        lng = -360 + point['lng']
    else:
        lng = point['lng']

    # Move everything but the lower 48 states into a nice-ish spot for render.
    if id[0:2] == '02':
        lat *= 0.25
        lng *= 0.15
        lng -= 93
        lat += 12.5
    elif id[0:2] == '15':
        lat += 6
        lng += 50
    elif id[0:2] == '60':
        if id == '60020':
            lng -= 0.75
        elif id == '60030':
            lat += 0.2
            lng -= 1.9
        elif id == '60040':
            lat -= 3
            lng += 0.4
        lat += 14
        lng += 170
        lat *= 4
        lng *= 4
        lat += 25
        lng -= 88
    elif id[0:2] == '66':
        lat -= 13.3
        lng += 200
        lat *= 2
        lng *= 2
        lat += 24
        lng -= 64.5
    elif id[0:2] == '69':
        lat -= 16
        lng += 213
        lat /= 3
        lng /= 3
        lat += 25.5
        lng -= 94
    elif id[0:2] == '72':
        lng *= 3
        lat *= 3
        lat -= 28
        lng += 111
    elif id[0:2] == '78':
        if id == '78020' or id == '78030':
            lat -= 0.3
        lat -= 17
        lng += 64
        lat *= 2
        lng *= 2
        lat += 22
        lng -= 83

    return {'lat': lat, 'lng': lng}

def main():
    g = generator.Generator(
            Assigner(),
            'GEOID',
            filter=filter,
            translator=translate)
    g.generate('cb_2018_us_county_5m.kml', 'country-counties')

if __name__ == '__main__':
    main()

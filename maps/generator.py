from collections import defaultdict
from pykml import parser
import argparse
import math
import os
import sys

MAX_WIDTH = 1000
LEVEL = 12

def adjust_lng(angle):
    if angle < math.pi:
        return angle + 2 * math.pi
    elif angle > math.pi:
        return angle - 2 * math.pi
    else:
        return angle

class NationalAtlas(object):
    def __init__(self):
        self.ref_lat = 45
        self.ref_lng = -100

    def extremes(self, bound):
        top = self.project({
            'lat': bound['high']['lat'],
            'lng': bound['low']['lng'],
        })
        left = self.project({
            'lat': (self.ref_lat + bound['low']['lat']) / 2,
            'lng': bound['low']['lng'],
        })
        bottom = self.project({
            'lat': bound['low']['lat'],
            'lng': self.ref_lng,
        })
        right = self.project({
            'lat': (self.ref_lat + bound['low']['lat']) / 2,
            'lng': bound['high']['lng'],
        })
        return ({
            'x': left['x'],
            'y': top['y'],
        }, {
            'x': right['x'],
            'y': bottom['y'],
        })

    def project(self, point):
        # https://pubs.usgs.gov/bul/1532/report.pdf page 172
        lat = math.radians(point['lat'])
        lng = adjust_lng(math.radians(point['lng']))
        ref_lat = math.radians(self.ref_lat)
        ref_lng = math.radians(self.ref_lng)
        delta_lng = adjust_lng(lng - ref_lng)

        # These forumulas are for the sphere, not the ellipsoid, though
        # National Atlas technically seems to use an ellipsoid. Oh well, USGS
        # tells us that they don't use the it (page 173.)
        R = 6370997
        k_p = math.sqrt(2 / (1 + math.sin(ref_lat) * math.sin(lat) + math.cos(ref_lat) * math.cos(lng) * math.cos(delta_lng)))
        return {
                'x': R * k_p * math.cos(lat) * math.sin(delta_lng),
                'y': -R * k_p * (math.cos(ref_lat) * math.sin(lat) - math.sin(ref_lat) * math.cos(lat) * math.cos(delta_lng)),
        }

class Mercator(object):
    def extremes(self, bound):
        top_left = self.project({
            'lat': bound['high']['lat'],
            'lng': bound['low']['lng'],
        })
        bottom_right = self.project({
            'lat': bound['low']['lat'],
            'lng': bound['high']['lng'],
        })
        return (top_left, bottom_right)

    def project(self, point):
        lat = math.radians(point['lat'])
        lng = math.radians(point['lng'])
        return {
            'x': 256 / 2 / math.pi * math.pow(2, LEVEL) * (lng + math.pi),
            'y': 256 / 2 / math.pi * math.pow(2, LEVEL) * (math.pi - math.log(math.tan(math.pi / 4 + lat / 2))),
        }


class Generator(object):
    def __init__(
            self,
            assigner,
            source_id_attr,
            filter=None,
            translator=None,
            dest_id_attr='id'):
        self.root = os.path.dirname(sys.argv[0])
        if not self.root:
            self.root = '.'
        self.assigner = assigner
        self.source_id_attr = source_id_attr
        self.filter = filter
        self.translator = translator
        self.dest_id_attr = dest_id_attr

        parser = argparse.ArgumentParser()
        parser.add_argument('--crush', action='store_true', required=False)
        parser.add_argument('--exact', action='store_true', required=False)
        parser.add_argument('--min-writable', default=0.5, required=False, type=float)
        parser.add_argument('--precision', default=0, required=False, type=int)
        parser.add_argument('--projection', default='mercator', required=False)
        args = parser.parse_args()
        self.pretty_print = not args.crush
        self.print_exact = args.exact
        self.min_writable = args.min_writable
        self.precision = args.precision
        if args.projection == 'mercator':
            self.projector = Mercator()
        elif args.projection == 'national_atlas':
            self.projector = NationalAtlas()
        else:
            raise Exception('Unknown projection {}'.format(args.projection))

    def generate(self, source, output_type):
        with open('{}/sources/{}'.format(self.root, source)) as f:
            doc = parser.parse(f)

        print('opened')

        groups = defaultdict(list)
        for placemark in doc.findall('.//{http://www.opengis.net/kml/2.2}Placemark'):
            id_query = ('.//{{http://www.opengis.net/kml/2.2}}SimpleData'
                        '[@name="{}"]'.format(self.source_id_attr))
            id = placemark.find(id_query).text
            print('reading ' + id)

            if hasattr(self.assigner, 'assign'):
                assignment = self.assigner.assign(id)
            elif hasattr(self.assigner, 'assign_complex'):
                assignment = self.assigner.assign_complex(placemark)
            else:
                raise Exception("Can't find assigner attribute")

            if not assignment:
                continue

            polygons = []
            bound = {
                'low': {'lat': 180, 'lng': 180},
                'high': {'lat': -180, 'lng': -180},
            }
            for polygon in placemark.findall('.//{http://www.opengis.net/kml/2.2}Polygon'):
                extrude = polygon.find('.//{http://www.opengis.net/kml/2.2}extrude')
                if extrude.text != '0':
                    raise Exception('Extrude is set')
                coordinates = polygon.find('.//{http://www.opengis.net/kml/2.2}coordinates')
                converted = []
                for vertex in coordinates.text.split(' '):
                    r = [float(p) for p in vertex.split(',')]
                    pos = {'lat': r[1], 'lng': r[0]}
                    if self.translator:
                        pos = self.translator(pos, id, assignment)
                    converted.append(pos)

                    if pos['lat'] < bound['low']['lat']:
                        bound['low']['lat'] = pos['lat']
                    if bound['high']['lat'] < pos['lat']:
                        bound['high']['lat'] = pos['lat']
                    if pos['lng'] < bound['low']['lng']:
                        bound['low']['lng'] = pos['lng']
                    if bound['high']['lng'] < pos['lng']:
                        bound['high']['lng'] = pos['lng']
                if self.filter:
                    if self.filter(converted, id, assignment):
                        polygons.append(converted)
                else:
                    polygons.append(converted)

            if isinstance(assignment, str):
                assignment = [assignment]
            for assign in assignment:
                groups[assign].append({
                    'id': id,
                    'bound': bound,
                    'polygons': polygons,
                })

        for group, shapes in groups.items():
            bound = {
                'low': {'lat': 180, 'lng': 180},
                'high': {'lat': -180, 'lng': -180},
            }
            for shape in shapes:
                if shape['bound']['low']['lat'] < bound['low']['lat']:
                    bound['low']['lat'] = shape['bound']['low']['lat']
                if bound['high']['lat'] < shape['bound']['high']['lat']:
                    bound['high']['lat'] = shape['bound']['high']['lat']
                if shape['bound']['low']['lng'] < bound['low']['lng']:
                    bound['low']['lng'] = shape['bound']['low']['lng']
                if bound['high']['lng'] < shape['bound']['high']['lng']:
                    bound['high']['lng'] = shape['bound']['high']['lng']

            (top_left, bottom_right) = self.projector.extremes(bound)
            scale = MAX_WIDTH / (bottom_right['x'] - top_left['x'])
            if scale > 1:
                scale = 1

            try:
                os.makedirs('{}/out/{}'.format(self.root, output_type))
            except FileExistsError:
                pass

            with open(
                    '{}/out/{}/{}.svg'.format(self.root, output_type, group),
                    'w') as f:
                self.print_header(f, scale, top_left, bottom_right)

                for shape in shapes:
                    self.print_shape(f, shape, scale, top_left, bottom_right)
                f.write('</svg>\n')

    def print_header(self, f, scale, top_left, bottom_right):
        f.write(('<?xml version="1.0" encoding="UTF-8"?>{nl}'
                 '''<!DOCTYPE svg PUBLIC '-//W3C//DTD SVG 1.1//EN' 'http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd'>{nl}'''
                 '<svg viewBox="0 0 {width:g} {height:g}" xmlns="http://www.w3.org/2000/svg">{nl}').format(
                     nl='\n' if self.pretty_print else '',
                     width=scale * (bottom_right['x'] - top_left['x']),
                     height=scale * (bottom_right['y'] - top_left['y'])))

    def print_shape(self, f, shape, scale, top_left, bottom_right):
        print('writing ' + shape['id'])

        if self.pretty_print:
            f.write('  ')

        f.write('<path {}="{}" d="'.format(self.dest_id_attr, shape['id']))

        cursor = [scale * top_left['x'], scale * top_left['y']]
        for polygon in shape['polygons']:
            cursor = self.print_polygon(f, polygon, scale, cursor)
            if self.pretty_print:
                f.write('\n')

        if self.pretty_print:
            f.write('" />\n')
        else:
            f.write('"/>')

    def print_polygon(self, f, polygon, scale, cursor):
        projected = self.projector.project(polygon[0])
        last = projected
        transformed = {
                'x': scale * projected['x'] - cursor[0],
                'y': scale * projected['y'] - cursor[1],
        }
        acc = self.write_vertex(f, 'm', transformed)
        cursor[0] += transformed['x'] + acc['x']
        cursor[1] += transformed['y'] + acc['y']

        for point in polygon[1:-1]:
            projected = self.projector.project(point)
            transformed = {
                    'x': scale * (projected['x'] - last['x']) - acc['x'],
                    'y': scale * (projected['y'] - last['y']) - acc['y'],
            }
            if abs(transformed['x']) < self.min_writable and not self.print_exact:
                acc['x'] = -transformed['x']
                transformed['x'] = 0
            else:
                acc['x'] = 0
            last['x'] = projected['x']

            if abs(transformed['y']) < self.min_writable and not self.print_exact:
                acc['y'] = -transformed['y']
                transformed['y'] = 0
            else:
                acc['y'] = 0
            last['y'] = projected['y']

            diff = self.write_vertex(f, 'l', transformed)
            acc['x'] += diff['x']
            acc['y'] += diff['y']
        f.write('z')
        return cursor

    def write_vertex(self, f, command, vertex):
        rounded = [
                self.maybe_round(vertex['x']),
                self.maybe_round(vertex['y']),
        ]

        if rounded[0] == 0 and rounded[1] == 0:
            if command == 'm':
                f.write('m0 0')
            return {'x': -vertex['x'], 'y': -vertex['y']}

        x = '{:g}'.format(rounded[0]).lstrip('0').replace('-0', '-') or '0'
        if x == '-':
            x = '0'
        y = '{:g}'.format(rounded[1]).lstrip('0').replace('-0', '-') or '0'
        if y == '-':
            y = '0'

        if (x != '0' and y != '0') or command == 'm':
            f.write('{}{}{}{}'.format(command, x, '' if not self.pretty_print and y[0] == '-' else ' ', y))
        elif x != '0':
            f.write('h{}'.format(x))
        elif y != '0':
            f.write('v{}'.format(y))
        return {'x': rounded[0] - vertex['x'], 'y': rounded[1] - vertex['y']}

    def maybe_round(self, x):
        if self.print_exact:
            return x
        else:
            return round(x, self.precision)


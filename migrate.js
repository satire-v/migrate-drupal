// const s3 = require('s3');
const request = require('request');
const fs = require('fs');
const yargs = require('yargs');
const cheerio = require('cheerio');

function processDrupalPublicImageUri(uri) {
  return [
    uri.replace('public://', 'http://satirev.org/sites/default/files/'),
    uri.replace(/^.*(\\|\/|\:)/, ''),
  ];
}

// function getAWSClient() {
//   return s3.createClient({
//     s3Options: {
//       accessKeyId: 'AKIAR6GW3CSFY5C7D3I3',
//       secretAccessKey: 'q5ZosBOOwlv9/qC3OR3RquEbeDy0svcwgKrFmj45',
//     },
//   });
// }

function uploadImageDirectus([uri, name]) {
  const key = 'site/images/' + name;
  var options = {
    uri: uri,
    encoding: null,
    headers: {
      'user-agent': 'node.js',
    },
  };
  request(options, function(error, response, body) {
    if (error || response.statusCode !== 200) {
      console.log('failed to get image');
      console.log(error);
    } else {
      request(
        {
          method: 'POST',
          url: 'http://admin.satirev.org/_/files',
          project: '_',
          auth: {
            bearer: 'idrdhjfrhcvdbedekjhfvjdbuuelhece',
          },
          formData: {
            filename: name,
            data: Buffer.from(body).toString('base64'),
          },
          json: true,
        },
        function(error, res, content) {
          if (error || response.statusCode !== 200) {
            console.log('failed to get upload image');
            console.log(error);
          }
          return { full_url: content.data.data.full_url, id: content.data.id };
        }
      );
    }
  });
}

async function fetchDrupalDatabase(database_name, database_pwd) {
  const mysql2 = require('mysql2/promise');
  const db = await mysql2.createConnection({
    host: 'localhost',
    user: 'root',
    password: database_pwd,
    database: database_name,
  });

  var [nodes, _] = await db.query(
    `SELECT
      n.nid,
      n.title,
      n.created,
      n.changed,
      n.status AS published,
      b.body_value AS body,
      c.field_caption_value AS caption,
      cat.field_category_tid AS category_id,
      tax.name AS cateogry_name,
      t.field_teaser_value AS teaser,
      y.field_year_value AS year,
      image.field_image_fid as image_id,
      files.uri as image_uri,
      urls.alias as relative_uri,
      GROUP_CONCAT 
      (DISTINCT CONCAT(tags_tax.tid,':',tags_tax.name) SEPARATOR ',') 
      AS tags_info
    FROM
      node n
      LEFT JOIN field_data_body b ON b.entity_id = n.nid
      LEFT JOIN field_data_field_caption c ON c.entity_id = n.nid
      LEFT JOIN field_data_field_category cat ON cat.entity_id = n.nid
      LEFT JOIN taxonomy_term_data tax ON tax.tid = cat.field_category_tid
      LEFT JOIN field_data_field_teaser t ON t.entity_id = n.nid
      LEFT JOIN field_data_field_year y ON y.entity_id = n.nid
      LEFT JOIN field_data_field_tags tags ON tags.entity_id = n.nid
      LEFT JOIN taxonomy_term_data tags_tax ON tags_tax.tid = tags.field_tags_tid
      LEFT JOIN field_revision_field_image image ON image.entity_id = n.nid
      LEFT JOIN file_managed files ON files.fid = image.field_image_fid
      LEFT JOIN url_alias urls ON CAST(REGEXP_REPLACE(urls.source, '[^0-9]', '') AS UNSIGNED) = n.nid
    WHERE n.type = ? AND urls.source LIKE 'node%' AND n.title LIKE '%malan%'
    GROUP BY n.nid,
      n.title,
      n.created,
      n.changed,
      published,
      body,
      caption,
      category_id,
      cateogry_name,
      teaser,
      year,
      image_id,
      image_uri,
      relative_uri
    ORDER BY n.created DESC
    LIMIT 
      10`,
    ['article', 'node']
  );
  nodes = JSON.parse(JSON.stringify(nodes));

  const $ = cheerio.load(nodes[0].body);
  console.log($('img'));
  await db.end();
  return nodes;
}

const argv = yargs
  .option('db', {
    alias: 'd',
    description: 'The database to query from',
    type: 'string',
  })
  .option('password', {
    alias: 'p',
    description: 'The password to the database to query from',
    type: 'string',
  })
  .help()
  .alias('help', 'h')
  .demandOption(
    ['db', 'password'],
    'Please provide database name and password. Assumed to be running on localhost, user root, port 3306 (MySQL)'
  ).argv;

fetchDrupalDatabase(argv.db, argv.password);

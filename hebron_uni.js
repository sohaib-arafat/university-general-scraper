const puppeteer = require('puppeteer');
const fs = require('fs');


async function main() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto('https://www.hebron.edu/index.php/arts-dep-2/arts-dep1/arts-dep1-courses.html');

    const arabicResultMap = await extractTextFromStrongElements(page);
    await saveToJson(arabicResultMap, 'arabic_data.json');

    await clickButtonAndReload(page);

    const englishResultMap = await extractTextFromStrongElements(page);
    await saveToJson(englishResultMap, 'english_data.json');


    await browser.close();
    await mergeJSONFiles();
   await filterObjectsWithValidFields('data.json')
}

(async () => {
    await main();
})();
function filterObjectsWithValidFields(fileName) {
     fs.readFile(fileName, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading file: ${err}`);
            return;
        }

        try {
             const dataArray = JSON.parse(data);

             const filteredArray = dataArray.filter(obj => {
                return obj.name && obj.name.trim().length > 0 && obj.uniID && isValidUniID(obj.uniID);
            });

             const updatedJson = JSON.stringify(filteredArray, null, 2);

             fs.writeFile(fileName, updatedJson, 'utf8', (err) => {
                if (err) {
                    console.error(`Error writing file: ${err}`);
                } else {
                    console.log('File updated successfully.');
                }
            });
        } catch (jsonError) {
            console.error(`Error parsing JSON: ${jsonError}`);
        }
    });
}

 function isValidUniID(uniID) {
      return uniID && uniID.trim().length > 0;
}
async function extractTextFromStrongElements(page) {
    const strongElements = await page.$$('strong');
    const extractedObjectsArray = [];

    for (const strongElement of strongElements) {
        const textContent = await (await strongElement.getProperty('textContent')).jsonValue();
        const hasFiveDigitNumber = /\b\d{5}\b/.test(textContent);

        const entryObject = {
            name: hasFiveDigitNumber ? textContent.replace(/\b\d{5}\b/, '').trim() : (textContent),
            id: hasFiveDigitNumber ? textContent.match(/\b\d{5}\b/)[0] : null
        };

        if (!hasFiveDigitNumber) {
            extractedObjectsArray.push(entryObject);
        } else {
            extractedObjectsArray.push(entryObject);
        }
    }

    console.log('Extracted Objects Map')
    return processArray(extractedObjectsArray);
}

function processArray(arr) {
    for (let i = 0; i < arr.length - 1; i++) {
        const currentMap = arr[i];
        const nextMap = arr[i + 1];

        if (currentMap.name === '') {
            if (nextMap) {
                currentMap.name = nextMap.name;
                arr.splice(i + 1, 1);
            }
        }
    }

    return arr;
}

async function clickButtonAndReload(page) {
    await page.click('#sp-language > div > div > div > div > ul > li > a');
    await page.reload({waitUntil: 'domcontentloaded'});
}

async function saveToJson(data, fileName) {
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Data saved to ${fileName}`);
}

function mergeJSONFiles() {
    const arabicData = JSON.parse(fs.readFileSync('arabic_data.json', 'utf8'));
    const englishData = JSON.parse(fs.readFileSync("english_data.json", 'utf8'));

    function mergeObjects(arabicObj, englishObj) {
        return {
            extn: "cors",
            showinDDM: false,
            priority: 0,
            altName: null,
            uniID: arabicObj.id,
            name: "hu_"+snakeCase(englishObj.name),
            translations: [{
                altName: null,
                fallback: true,
                locale: 'ar',
                region: 'SA',
                name: arabicObj.name
            },{
                altName: null,
                fallback: false,
                locale: 'en',
                region: 'US',
                name: englishObj.name
            }
            ]
        };
    }

    const mergedData = arabicData.map(arabicObj => {
        const correspondingEnglishObj = englishData.find(englishObj => englishObj.id === arabicObj.id);
        if (correspondingEnglishObj) {
            return mergeObjects(arabicObj, correspondingEnglishObj);
        } else {
            return null;
        }
    }).filter(obj => obj !== null);

    fs.writeFileSync("data.json", JSON.stringify(mergedData, null, 2));
}
// function isValidDataObject(obj) {
//     if (!obj || !obj.id || !obj.name || typeof obj.name !== 'object' || !obj.name.arabic || !obj.name.english) {
//         return false;
//     }
//
//      obj.name.arabic = obj.name.arabic.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
//     obj.name.english = obj.name.english.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
//
//      return obj.name.arabic !== '' && obj.name.english !== '';
// }
// function cleanAndSaveFinalData(file) {
//     const jsonData = JSON.parse(fs.readFileSync(file, 'utf8'));
//
//     const cleanedData = jsonData.filter(isValidDataObject);
//
//     fs.writeFileSync(file, JSON.stringify(cleanedData, null, 2), 'utf-8');
//     console.log('Cleaned data saved to final.json');
// }
function snakeCase(text) {
    text = text.trim().replace(/\W+/g, '_');
    return text.toLowerCase();
}
// async function addMajor() {
//     const major = await readJsonFile("data.json")
//     const {id} = await db.collection("files").add({
//         "name": major['major'],
//         "extn": "mjor",
//         "showinDDM": true,
//         "uniID": null,
//         "priority": 0,
//         "altName": null,
//         "parent": {"name": "ptuk_faculty_of_information_technology", "id": "RlE5RmkII31eMNAeEBxR"}
//     })
//     for (const cors of major.subjects) {
//         const query1 = await db.collection("files").where("uniID", "==", cors.uniID).get();
//         if (query1.empty) {
//             cors["parents"] = [{"name": major.major, "id": id}]
//             await db.collection("files").doc().set(cors);
//         } else {
//             await query1.docs[0].ref.update({
//                 "parents": admin.firestore.FieldValue.arrayUnion({
//                     "name": major.major,
//                     "id": id
//                 })
//             })
//         }
//     }
// }
// function readJsonFile(filename) {
//     try {
//         const data = ts.readFileSync(filename, 'utf8');
//         return JSON.parse(data);
//     } catch (error) {
//         console.error('Error reading or parsing JSON file:', error);
//         return null;
//     }
// }

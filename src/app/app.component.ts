import * as vscode from 'vscode';

import { Component } from '@angular/core';
import * as jsYaml from 'js-yaml';
import * as _ from 'lodash';

class YamlFile {
  id = -1;
  path = '';
  contents = '';
  showWhenSelected = true;
  include = true;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  id = 0;
  yamlFiles: YamlFile[];
  selectedYamlFiles: YamlFile[];
  sidebarVisible = true;

  mergedYaml = '';
  overrides = '';

  vscode: any;

  constructor() {
    this.vscode = window['acquireVsCodeApi']();
    this.yamlFiles = [];
    this.selectedYamlFiles = [];
  }

  moveFileUp(index: number) {
    const fileAtIndex = this.yamlFiles[index];
    this.yamlFiles[index] = this.yamlFiles[index - 1];
    this.yamlFiles[index - 1] = fileAtIndex;
    this.onSelection();
  }

  moveFileDown(index: number) {
    const fileAtIndex = this.yamlFiles[index];
    this.yamlFiles[index] = this.yamlFiles[index + 1];
    this.yamlFiles[index + 1] = fileAtIndex;
    this.onSelection();
  }

  removeFile(index: number) {
    this.yamlFiles.splice(index, 1);
  }

  onSelection() {
    const selectedIndices: Array<number> = [];
    this.selectedYamlFiles.forEach((selectedYamlFile) => {
      const index = this.yamlFiles.findIndex((yamlFile) => yamlFile.id === selectedYamlFile.id);
      if (index != -1) {
        selectedIndices.push(index);
      }
    });

    selectedIndices.sort();

    const yamlJSONs: string[] = [];
    const yamlFiles: YamlFile[] = [];
    selectedIndices.forEach((index: number) => {
      if (this.yamlFiles[index].include) {
        yamlFiles.push(this.yamlFiles[index]);
        yamlJSONs.push(jsYaml.load(this.yamlFiles[index].contents) as any);
      }
    });

    this.overrides = '';
    this.mergedYaml = this.yamlMerge(yamlJSONs, yamlFiles)
    // The above call populated the this.overrides
    let overrideLines = this.overrides.split('\n');
    const longestFileName = Math.max(...overrideLines.map(overrideLine => overrideLine.length));
    const mergedYamlLines = this.mergedYaml.split('\n');
    if (mergedYamlLines.length > 0 && mergedYamlLines[mergedYamlLines.length - 1] === '') {
      mergedYamlLines.pop();
    }
    if (overrideLines.length === mergedYamlLines.length) {
      for (let i = 0; i < mergedYamlLines.length; i++) {
        mergedYamlLines[i] = overrideLines[i].padStart(longestFileName, ' ') + ': ' + mergedYamlLines[i];
      }
    }

    this.mergedYaml = mergedYamlLines.join('\n');
  }

  yamlMerge(yamlJSONs: any[], yamlFiles: YamlFile[]): string {
    if (yamlJSONs.length === 0) {
      return '';
    }
    const winnersMap = {};
    let outputJSON = {};
    for (let i = 0; i < yamlJSONs.length; i++) {
      const yamlJSON = yamlJSONs[i];
      const yamlPathAndId = yamlFiles[i].path + '@' + yamlFiles[i].id;
      const propertyPath = [];
      const objType = [];
      const srcType = [];
      outputJSON = _.mergeWith(outputJSON, yamlJSON, (objValue: any, srcValue: any, key: any, objectx: any, source: any, stack: any) => {

        const objValueType = _.isArray(objValue) ? 'array' : typeof objValue;
        const srcValueType = _.isArray(srcValue) ? 'array' : typeof srcValue;

        if (propertyPath.length < stack.size) {
          propertyPath.push(key);

          objType.push(objValueType);

          srcType.push(srcValueType);
        } else if (propertyPath.length > stack.size) {
          propertyPath.length = stack.size;
          propertyPath.push(key);

          objType.length = stack.size;
          objType.push(objValueType);

          srcType.length = stack.size;
          srcType.push(srcValueType);
        } else {
          propertyPath[stack.size] = key;
          objType[stack.size] = objValueType;
          srcType[stack.size] = srcValueType;
        }

        const propertyPathString = propertyPath.toString().replace(/,/g, '.');
        if (objValueType === 'undefined') {
          // Sure winner
          winnersMap[propertyPathString] = { win: true, merge: false, valuesFile: yamlPathAndId };
        } else if (objValueType === 'object' && srcValueType === 'object') {
          winnersMap[propertyPathString] = { win: false, merge: true, valuesFile: yamlPathAndId };
        } else {
          winnersMap[propertyPathString] = { win: true, merge: false, valuesFile: yamlPathAndId };
        }
        // if (objValueType === 'array' && srcValueType === 'array') {
        //   objValue = [...srcValue];

        //   const winnerMapKeys = Object.keys(winnersMap);
        //   winnerMapKeys.forEach((winnerMapKey) => {
        //     if (winnerMapKey.startsWith(propertyPathString + '.')) {
        //       delete winnersMap[winnerMapKey];
        //     }
        //   })
        //   for (let i = 0; i < srcValue.length; i++) {
        //     winnersMap[propertyPathString + '.' + i] = { win: true, merge: false, valuesFile: yamlPathAndId };
        //   }
        //   return objValue;
        // }
        return undefined;
      });
    }

    const keysToKeep = [];
    this.getKeys(outputJSON, keysToKeep);
    const preocessedWinnersArray = [];

    keysToKeep.forEach((keyToKeep) => {
      preocessedWinnersArray.push(winnersMap[keyToKeep].valuesFile);
    });

    this.overrides = preocessedWinnersArray.join('\n');
    const outputYAML = jsYaml.dump(outputJSON, {
      indent: 2,
      lineWidth: 120,
      noRefs: true
    });
    return outputYAML;
  }

  getKeys(obj: any, res = [], parent = '') {
    const keys = Object.keys(obj);
    /** Loop throw the object keys and check if there is any object there */
    keys.forEach(key => {
      // Generate the heirarchy
      if (_.isArray(obj) && obj[key] !== null && (typeof obj[key] === 'object')) {
        // skip
      } else {
        parent ? res.push(`${parent}.${key}`) : res.push(key);
      }
      if (obj && obj[key] !== null && obj[key] !== undefined && typeof obj[key] === 'object') {
        // If object found then recursively call the function with updpated parent
        let newParent = parent ? `${parent}.${key}` : key;
        this.getKeys(obj[key], res, newParent);
      }
    });
  }

  async uploadHandler(event: any, upload: any) {
    const files = event.files;
    for (let file of files) {
      const reader = new FileReader();
      if (reader) {
        reader.onload = () => {
          this.yamlFiles.push(
              {
                id: this.id++,
                path: file.name,
                contents: reader.result as string,
                showWhenSelected: true,
                include: true
              }
            );
        };
        reader.readAsText(file);
      }
    }
    upload.clear();
  }

  compare(yamlFileLeft: YamlFile, yamlFileRight: YamlFile) {
    this.vscode.postMessage({
      command: 'compare',
      yamlFileLeft: yamlFileLeft,
      yamlFileRight: yamlFileRight
    });
  }

}

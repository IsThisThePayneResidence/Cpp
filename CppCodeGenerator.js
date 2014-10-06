/*
 * Copyright (c) 2014 MKLab. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, regexp: true */
/*global define, $, _, window, staruml, type, document, cpp */

define(function (require, exports, module) {
	"use strict";
    
    var _CPP_CODE_GEN_H = "h";
    var _CPP_CODE_GEN_CPP = "cpp";
    
    var _CPP_PUBLIC_MOD = "public";
    var _CPP_PROTECTED_MOD = "protected";
    var _CPP_PRIVATE_MOD = "private";
    
	var Repository = staruml.getModule("engine/Repository"),
		Engine     = staruml.getModule("engine/Engine"),
		FileSystem = staruml.getModule("filesystem/FileSystem"),
		FileUtils  = staruml.getModule("file/FileUtils"),
		Async      = staruml.getModule("utils/Async"),
		UML        = staruml.getModule("uml/UML");

	var CodeGenUtils = require("CodeGenUtils");

	var copyrightHeader = "/* Test header @ toori67 \n * This is Test\n * also test\n * also test again\n */";
    var versionString = "v0.0.1";
        
    
	/**
	 * Cpp code generator
	 * @constructor
	 * 
	 * @param {type.UMLPackage} baseModel
	 * @param {string} basePath generated files and directories to be placed
	 * 
	 */
	function CppCodeGenerator(baseModel, basePath) {
	
		/** @member {type.Model} */
		this.baseModel = baseModel;
		
		/** @member {string} */
		this.basePath = basePath;
        
	}

	/**
	 * Return Indent String based on options
	 * @param {Object} options
	 * @return {string}
	 */
	CppCodeGenerator.prototype.getIndentString = function (options) {
		if (options.useTab) {
			return '\t';
		} else {
			
			var i, len, indent = [];
			for (i = 0, len = options.indentSpaces; i < len; i++) {
				indent.push(" ");
			}
			return indent.join("");
		}
	};
    
    
	CppCodeGenerator.prototype.generate = function (elem, path, options) {
         
        
        var getFilePath = function (extenstions) {
            var abs_path = path + "/" + elem.name + ".";
            if (extenstions === _CPP_CODE_GEN_H) {
                abs_path += _CPP_CODE_GEN_H;
            } else {
                abs_path += _CPP_CODE_GEN_CPP;
            }
            return abs_path;
        };
        var writeClassHeader = function (codeWriter, elem, cppCodeGen) {
            var i;
            var write = function (items) {
                var i;
                for (i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item instanceof type.UMLAttribute ||  item instanceof type.UMLAssociationEnd) { // if write member variable
                        codeWriter.writeLine(cppCodeGen.getMemberVariable(item));
                    } else if (item instanceof type.UMLOperation) { // if write method 
                        codeWriter.writeLine(cppCodeGen.getMethod(item));
                    }
                }
            };
            var writeInheritance = function (elem) {
                var inheritString = ": ";
                var genList = cppCodeGen.getSuperClasses(elem);

                if(genList.length === 0){
                    return "";
                }

                var i;
                var term = [];


                for (i = 0; i<genList.length; i++){
                    var generalization = genList[i];
                    // public AAA, private BBB
                    term.push(generalization.visibility + " " + generalization.target.name);
                }
//                    inheritString = inheritString.substring(0, inheritString.length - 2);
                inheritString += term.join(", ");
                return inheritString;
            }

            // member variable
            var memberAttr = elem.attributes.slice(0);
            var associations = Repository.getRelationshipsOf(elem, function (rel) {
                return (rel instanceof type.UMLAssociation);
            });
            for (i = 0; i < associations.length; i++) {
                var asso = associations[i];
                if (asso.end1.reference === elem && asso.end2.navigable === true && asso.end2.name.length !== 0) {
                    memberAttr.push(asso.end2);
                } else if (asso.end2.reference === elem && asso.end1.navigable === true && asso.end1.name.length !== 0) {
                    memberAttr.push(asso.end1);
                }
            }

            // method 
            var methodList = elem.operations.slice(0);

//                void loadMaskedPoints(CImage img, CImage mask, int idx);


            var allMembers = memberAttr.concat(methodList);

            var classfiedAttributes = cppCodeGen.classifyVisibility(allMembers);

            var finalModifier = "";
            if (elem.isFinalSpecification === true || elem.isLeaf === true) {
                finalModifier = " final ";
            }

            codeWriter.writeLine("class " + elem.name + finalModifier + writeInheritance(elem) + " {");
            if (classfiedAttributes._public.length > 0) {
                codeWriter.writeLine("public: ");
                codeWriter.indent();
                write(classfiedAttributes._public);
                codeWriter.outdent();
            }
            if (classfiedAttributes._protected.length > 0) {
                codeWriter.writeLine("protected: ");
                codeWriter.indent();
                write(classfiedAttributes._protected);
                codeWriter.outdent();
            }
            if (classfiedAttributes._private.length > 0) {
                codeWriter.writeLine("private: ");
                codeWriter.indent();
                write(classfiedAttributes._private);
                codeWriter.outdent();
            }

            codeWriter.writeLine("}");
        };
        
		var result = new $.Deferred(),
		self = this,
		fullPath,
		directory,
		file;
        
		// Package -> as namespace or not
		if (elem instanceof type.UMLPackage) {
			fullPath = path + "/" + elem.name;
			directory = FileSystem.getDirectoryForPath(fullPath);
			directory.create(function (err, stat) {
				if (!err || err === "AlreadyExists") {
					Async.doSequentially(
						elem.ownedElements,
						function (child) {
							return self.generate(child, fullPath, options);
						},
						false
					).then(result.resolve, result.reject);
				} else {
				    result.reject(err);
				}
			});
            
        } else if (elem instanceof type.UMLClass) {

            // generate class header elem_name.h 
            
			file = FileSystem.getFileForPath(getFilePath(_CPP_CODE_GEN_H));
			FileUtils.writeText(file, this.writeHeaderSkeletonCode(elem, options, writeClassHeader), true).then(result.resolve, result.reject);
            
            // generate class cpp elem_name.cpp
            
		
        } else if (elem instanceof type.UMLInterface) {
            /**
             * interface will convert to class which only contains virtual method and member var.
             */
            
            // generate interface header ONLY elem_name.h
			file = FileSystem.getFileForPath(getFilePath(_CPP_CODE_GEN_H));
			FileUtils.writeText(file, this.writeHeaderSkeletonCode(elem, options, writeClassHeader), true).then(result.resolve, result.reject);
            
         
        } else if (elem instanceof type.UMLEnumeration) {
            // generate enumeration header ONLY elem_name.h 
            var writeEnumeration = function (codeWriter, elem, cppCodeGen) {
                codeWriter.writeLine(cppCodeGen.getModifiers(elem) + " enum " + elem.name + " { "  + _.pluck(elem.literals, 'name').join(", ")  + " };");
            };
			file = FileSystem.getFileForPath(getFilePath(_CPP_CODE_GEN_H));
			FileUtils.writeText(file, this.writeHeaderSkeletonCode(elem, options, writeEnumeration), true).then(result.resolve, result.reject);
        } else {
			result.resolve();
		}
		return result.promise();
	};

    /**
     * Write *.h file. Implement functor to each uml type.
     * Returns text 
     * 
     * @param {Object} elem
     * @param {Object} options
     * @param {Object} functor
     * @return {Object} string
     */
    CppCodeGenerator.prototype.writeHeaderSkeletonCode = function (elem, options, funct) {
        var headerString = "_" + elem.name.toUpperCase() + "_H";
        var codeWriter = new CodeGenUtils.CodeWriter(this.getIndentString(options));
        var includePart = this.getIncludePart(elem);
        var templatePart = this.getTemplateParameter(elem);
        codeWriter.writeLine(copyrightHeader);
        codeWriter.writeLine();
		codeWriter.writeLine("#ifndef " + headerString);
		codeWriter.writeLine("#define " + headerString);
        codeWriter.writeLine();
        
        if(includePart.length > 0){
            codeWriter.writeLine(includePart);
            codeWriter.writeLine();
        }
        if (templatePart.length > 0) {
           codeWriter.writeLine(templatePart);
        }
        funct(codeWriter, elem, this);
        
        codeWriter.writeLine();
		codeWriter.writeLine("#endif //" + headerString);
        return codeWriter.getData();
    };
    
    CppCodeGenerator.prototype.getIncludePart = function (elem) {
        
        var i;
        var trackingHeader = function (elem, target) {
            var header = "";
            var elementString = "";
            var targetString = "";
            var i;
            
            
            while (elem._parent._parent !== null) {
                elementString = (elementString.length !== 0) ?  elem.name + "/" + elementString : elem.name;
                elem = elem._parent;
            }
            while (target._parent._parent !== null) {
                targetString = (targetString.length !== 0) ?  target.name + "/" + targetString : target.name;
                target = target._parent;
            }
            
            var idx;
            for (i = 0; i < (elementString.length < targetString.length) ? elementString.length : targetString.length; i++) {
                if (elementString[i] !== targetString[i]) {
                    idx = i;
                    break;
                }
            }
            // remove common path
            elementString = elementString.substring(idx, elementString.length);
            targetString = targetString.substring(idx, targetString.length);
            
            for (i = 0; i < elementString.split('/').length - 1; i++) {
                header += "../";
            }
            header += targetString;
            
            return header;
        };
        
        CppCodeGenerator.prototype.getTemplateParameter = function (elem) {
            var i;
            var returnTemplateString = "";
            if(elem.templateParameters.length <= 0){
                return returnTemplateString;
            }
            var term = [];
            returnTemplateString = "template<";
            
            for (i = 0; i<elem.templateParameters.length; i++){
                var template = elem.templateParameters[i];
                var templateStr = template.parameterType + " ";
                templateStr += template.name + " " ;
                if(template.defaultValue.length !== 0){
                    templateStr += " = " + template.defaultValue;
                }
                term.push(templateStr);
            }
            returnTemplateString += term.join(", ");
            returnTemplateString += ">";
            return returnTemplateString;
        };
        
        var headerString = "";
        if (Repository.getRelationshipsOf(elem).length <= 0) {
            return "";
        }
        var associations = Repository.getRelationshipsOf(elem, function (rel) {
            return (rel instanceof type.UMLAssociation);
        });
        var realizations = Repository.getRelationshipsOf(elem, function (rel) {
            return (rel instanceof type.UMLInterfaceRealization || rel instanceof type.UMLGeneralization);
        });
        
        // check for interface or class
        for (i = 0; i < realizations.length; i++) {
            var realize = realizations[i];
            if (realize.target === elem) {
                continue;
            }
            headerString += "#include \"" + trackingHeader(elem, realize.target) + ".h\"\n";
        }
        
        // check for member variable 
        for (i = 0; i < associations.length; i++) {
            var asso = associations[i];
            var target;
            if (asso.end1.reference === elem && asso.end2.navigable === true && asso.end2.name.length !== 0) {
                target = asso.end2.reference;
            } else if (asso.end2.reference === elem && asso.end1.navigable === true && asso.end1.name.length !== 0) {
                target = asso.end1.reference;
            } else {
                continue;
            }
            if (target === elem) {
                continue;
            }
            headerString += "#include \"" + trackingHeader(elem, target) + ".h\"\n";
        }
        
        return headerString;
    };
    
    // 접근자를 기준으로 public, protected, private 으로 분류 
    CppCodeGenerator.prototype.classifyVisibility = function (items) {
        var public_list = [];
        var protected_list = [];
        var private_list = [];
        var i;
        for (i = 0; i < items.length; i++) {
            
            var item = items[i];
            var visib = this.getVisibility(item);
            
            if ("public" === visib) {
                public_list.push(item);
            } else if ("private" === visib) {
                private_list.push(item);
            } else {
                // if modifier not setted, consider it as protected
                protected_list.push(item);
            }
        }
        return {
            _public : public_list,
            _protected: protected_list,
            _private: private_list
        };
    };
    
    CppCodeGenerator.prototype.getMemberVariable = function (elem) {
        if (elem.name.length > 0) {
			var terms = [];
			// doc
			var docs = this.getDocuments(elem.documentation);
			// modifiers
			var _modifiers = this.getModifiers(elem);
			if (_modifiers.length > 0) {
				terms.push(_modifiers.join(" "));
			}
			// type
			terms.push(this.getType(elem));
			// name
			terms.push(elem.name);
			// initial value
			if (elem.defaultValue && elem.defaultValue.length > 0) {
				terms.push("= " + elem.defaultValue);
			}
			return (docs + terms.join(" ") + ";");
		}
	};
    
    CppCodeGenerator.prototype.getMethod = function (elem) {
        if(elem.name.length > 0){
            var i;
            var methodStr = "";
            var isVirtaul = false;
            // TODO virtual fianl static 키워드는 섞어 쓸수가 없다 
            if (elem.isStatic === true) {
                methodStr += "static ";
            } else if( elem.isAbstract === true) {
                methodStr += "virtual ";
            }
            
            var returnTypeParam = _.filter( elem.parameters , function (params) {
               return params.direction === "return";
            });
            var inputParams = _.filter (elem.parameters, function (params) {
               return  params.direction === "in";
            });
            var inputParamStrings = [];
            for(i = 0; i<inputParams.length; i++){
                var inputParam = inputParams[i];
                inputParamStrings.push(inputParam.type + " " + inputParam.name);
            }
            
            
            methodStr += ((returnTypeParam.length > 0) ? returnTypeParam[0].type : "void" ) + " ";
            methodStr += elem.name;
            methodStr += "(" + inputParamStrings.join(", ") + ")";
            
            if (elem.isLeaf === true) {
                methodStr += " final"
            }else if (elem.isAbstract === true) { // TODO 만약 virtual 이면 모두 pure virtual? 체크 할것 
                methodStr += " = 0";
            }
            methodStr += ";";
            return methodStr;
        }
    };
    
    CppCodeGenerator.prototype.getDocuments = function (text) {
        var docs = "";
		if (_.isString(text) && text.length !==0) {
			var lines = text.trim().split("\n");
            docs += "/**\n";
            var i;
			for (i = 0; i < lines.length; i++) {
                docs += " * " + lines[i] + "\n";
			}
            docs += " */\n";
		}
        return docs;
	};
    
	CppCodeGenerator.prototype.getVisibility = function (elem) {
		switch (elem.visibility) {
		case UML.VK_PUBLIC:
			return "public";
		case UML.VK_PROTECTED:
			return "protected";
		case UML.VK_PRIVATE:
			return "private";
		}
		return null;
	};
    
    CppCodeGenerator.prototype.getModifiers = function (elem) {
		var modifiers = [];

        if (elem.isStatic === true) {
            modifiers.push("static");
        }
        if (elem.isReadOnly === true) {
            modifiers.push("const");
        }
        if (elem.isAbstract === true) {
            modifiers.push("virtual");
        }
		return modifiers;
	};
    
    CppCodeGenerator.prototype.getType = function (elem) {
		var _type = "void";
		
		if (elem instanceof type.UMLAssociationEnd) { // member variable from association
			if (elem.reference instanceof type.UMLModelElement && elem.reference.name.length > 0) {
				_type = elem.reference.name;
			}
		} else { // member variable inside class
			if (elem.type instanceof type.UMLModelElement && elem.type.name.length > 0) {
				_type = elem.type.name;
			} else if (_.isString(elem.type) && elem.type.length > 0) {
				_type = elem.type;
			}
		}
        
		// multiplicity
		if (elem.multiplicity) {
			if (_.contains(["0..*", "1..*", "*"], elem.multiplicity.trim())) {
				if (elem.isOrdered === true) {
					_type = "Vector<" + _type + ">";
				} else {
					_type = "Vector<" + _type + ">";
				}
			} else if (elem.multiplicity.match(/^\d+$/)) { // number
                //TODO check here 
				_type += "[]";
			}
		}
		return _type;
	};
    
    CppCodeGenerator.prototype.getSuperClasses = function (elem) {
		var generalizations = Repository.getRelationshipsOf(elem, function (rel) {
			return ( (rel instanceof type.UMLGeneralization || rel instanceof type.UMLInterfaceRealization ) && rel.source === elem);
		});
        return generalizations;
	};
    
	function generate(baseModel, basePath, options) {
		var result = new $.Deferred();
		var cppCodeGenerator = new CppCodeGenerator(baseModel, basePath);
		return cppCodeGenerator.generate(baseModel, basePath, options);
    }
	
    function getVersion() {return versionString; }
    
    exports.generate = generate;
    exports.getVersion = getVersion;
});
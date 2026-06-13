<?php

/**
 * Evaluates a PUDO file (a PHP class extending Pudo\Resource) and prints the
 * canonical UDO v1 JSON document to stdout. The udo CLI shells out to this
 * script; the resulting JSON goes through the same schema validation and
 * generators as a .udo.json file.
 *
 * Usage: php eval-pudo.php /path/to/Product.pudo.php
 *
 * The PUDO file may either simply declare the class, or `return` an instance
 * or a fully qualified class name.
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

spl_autoload_register(function (string $class): void {
    if (str_starts_with($class, 'Pudo\\')) {
        $path = __DIR__ . '/src/' . substr($class, strlen('Pudo\\')) . '.php';
        if (is_file($path)) {
            require $path;
        }
    }
});

function fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

if (!isset($argv[1])) {
    fail('Usage: php eval-pudo.php <file.pudo.php>');
}

$file = $argv[1];
if (!is_file($file)) {
    fail("File not found: {$file}");
}

try {
    $returned = require $file;
} catch (\Throwable $e) {
    fail(get_class($e) . ': ' . $e->getMessage());
}

$resource = null;

if ($returned instanceof Pudo\Resource) {
    $resource = $returned;
} elseif (is_string($returned) && is_a($returned, Pudo\Resource::class, true)) {
    $resource = new $returned();
} else {
    // The file just declared the class: find the last non-abstract
    // Pudo\Resource subclass it brought into existence.
    foreach (array_reverse(get_declared_classes()) as $class) {
        if (is_subclass_of($class, Pudo\Resource::class)) {
            $reflection = new ReflectionClass($class);
            if (!$reflection->isAbstract()) {
                $resource = $reflection->newInstance();
                break;
            }
        }
    }
}

if ($resource === null) {
    fail("No class extending Pudo\\Resource found in {$file}.");
}

try {
    echo $resource->toJson(), PHP_EOL;
} catch (\Throwable $e) {
    fail(get_class($e) . ': ' . $e->getMessage());
}

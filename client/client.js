$(function() {
    var connected = false;
    var waiting = false;
    var selectedDeviceName = "";
    var socket = io();

    $(".config-field").on('change', function() {
        if (!connected)
        {
            $(this).val('');
            return;
        }
        $(this).prop("disabled", true);
        socket.emit('config change', {field: $(this).attr("name"), value: $(this).val()});
    });
    socket.on('config change', function(data) {
        $("input[name=" + data.field + "]").prop("disabled", false);
        $("input[name=" + data.field + "]").val(data.value);
    });

    var scale1 = d3.scale.linear().domain([-2, 2]).nice();
    var scale2 = d3.scale.linear().domain([-5000, 5000]).nice();
    var series = new Rickshaw.Series.FixedDuration([{ name: 'current', color: 'blue', scale: scale1}, {name: 'charge_voltage', color: 'green', scale: scale1}], undefined, {
	timeInterval: 100,
	timeBase: new Date().getTime() / 1000,
	maxDataPoints: 250
    });
    var graph = new Rickshaw.Graph({
	element: $("#graph")[0],
	width: $("#graph").parent().width() - 60,
	height: 400,
        renderer: 'line',
        series: series,
        min: 'auto'
    });
    var y_ticks = new Rickshaw.Graph.Axis.Y.Scaled( {
        graph: graph,
        orientation: 'left',
        scale: scale1,
        tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
        element: document.getElementById('y_axis_left')
    } );
    var y_ticks2 = new Rickshaw.Graph.Axis.Y.Scaled( {
        graph: graph,
        orientation: 'right',
        tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
        scale: scale2,
        element: document.getElementById('y_axis_right')
    } );
    new Rickshaw.Graph.HoverDetail( {
        graph: graph
    });
    graph.render();
    socket.on('graph', function(data) {
        graph.series.addData(data);
        if ($("#graph").parent().width() > 0)
            graph.configure({width: $("#graph").parent().width() - 60, height: 400});
        graph.render();
    });

    var bargraph = new Rickshaw.Graph({
        element: document.querySelector("#bargraph"),
	width: $("#bargraph").parent().width() - 60,
	height: 400,
        renderer: 'bar',
        series: [{
            name: 'cells',
            data: [],
            color: 'lightgreen',
        }],
        min: 1.5,
        max: 5
    });
    var y_bar = new Rickshaw.Graph.Axis.Y( {
        graph: bargraph,
        orientation: 'left',
        tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
        element: document.getElementById('y_axis_bar')
    } );
    new Rickshaw.Graph.HoverDetail( {
        graph: bargraph
    });

    bargraph.render();
    socket.on('cells', function(data) {
        data.forEach(function(element, index) {
            var y = parseFloat(data[index].y);
            if (y > 5.0)
                y = 0;
            data[index].y = y;
        });
        bargraph.series[0].data = data;
        if ($("#bargraph").parent().width() > 0)
            bargraph.configure({width: $("#bargraph").parent().width() - 60, height: 400});
        bargraph.update();
    });

    $("#disconnect").modal({closable: false});
    socket.on('disconnect', function(){
        $("#disconnect").modal('show');
        connected = false;
        $('#status i').attr("class", "grey circle icon");
        $('#status .content').text("Not Connected");
        $('#connect span').text("Connect");
        $('#output').html('');
        $("#cmd").html('<span id="input"><span class="cursor noblink">&nbsp;</span></span>');
        $("#version").html("0.0");
        $("#voltage").html("0.0");
        $("#temperature").html("0.0");
        $('#ports').dropdown('set value', '');
        $('#ports').dropdown('set selected', '');
        $('#ports #select-port').text("Select Port...");
        $(".config-field").each(function(index) {
            $(this).val('');
        });
    });
    socket.on('connect', function(){
        $("#disconnect").modal('hide');
	socket.emit('list ports');
    });
    socket.emit('list ports');
    $('#listports').click(function() {
	socket.emit('list ports');
    });
    $('#connect').click(function() {
        if (!connected)
        {
            socket.emit('connect port', $('#ports').dropdown('get value'));
        }
        else
        {
            socket.emit('disconnect port');
        }
    });
    $('#input').keyup(function(e) {
        if (e.keyCode == 13) {
            socket.emit('serial send', $('#input').val());
            $('#input').val('');
        }
    });

    socket.on('list ports', function(list) {
        $('#ports .menu').empty();
        list.list.forEach(function(port) {
            var option = $('<div class="item" value="' + port.comName + '"><div class="text">' + port.comName + '</div><div class="description" style="float: none; margin: 0; margin-top: 4px">' + port.manufacturer.split(' ')[0] + ' v' + port.serialNumber + '</div></div>');
            $('#ports .menu').append(option);
        });
        if (list.list.indexOf($('#ports').dropdown('get value')) == -1)
        {
            $('#ports').dropdown('set value', '');
            $('#ports #select-port').text("Select Port...");
        }
    });
    socket.on('connect port', function() {
        connected = true;
        $("#cmd").html(inputReset);
        $("#console").scrollTop(999999999);
        cursor = $(".cursor");
        historyIndex = 0;
        waiting = false;
        $('#status i').removeClass("grey");
        $('#status i').addClass("green");
        $('#status .content').html(selectedDeviceName + '<div class="sub header">Status: Idle</div>');
        $('#connect span').text("Disconnect");
    });
    socket.on('disconnect port', function() {
        connected = false;
        $('#status i').attr("class", "grey circle icon");
        $('#status .content').text("Not Connected");
        $('#connect span').text("Connect");
        $('#output').html('');
        $("#cmd").html('<span id="input"><span class="cursor noblink">&nbsp;</span></span>');
        $("#version").html("0.0");
        $("#voltage").html("0.0");
        $("#temperature").html("0.0");
        $(".config-field").each(function(index) {
            $(this).val('');
        });
        socket.emit('list ports');
    });
    socket.on('fw version', function(data) {
        $("#version").html(data);
    });
    socket.on('voltage', function(data) {
        $("#voltage").html(data);
    });
    socket.on('temperature', function(data) {
        $("#temperature").html(data);
    });
    socket.on('status_update', function(data) {
        if (data.fault > 0)
        {
            $('#status i').attr("class", "red circle icon");
            if (data.fault == 1)
                $('#status .content .sub.header').text('Status: Fault (Undervoltage)');
            else if (data.fault == 2)
                $('#status .content .sub.header').text('Status: Fault (Overvoltage)');
            else if (data.fault == 4)
                $('#status .content .sub.header').text('Status: Fault (Overcurrent)');
            else if (data.fault == 8)
                $('#status .content .sub.header').text('Status: Fault (Battery Temperature)');
            else if (data.fault == 16)
                $('#status .content .sub.header').text('Status: Fault (Board Temperature)');
            else if (data.fault == 32)
                $('#status .content .sub.header').text('Status: Fault (Short)');
        }
        else if (data.charging)
        {
            $('#status i').attr("class", "orange circle icon");
            $('#status .content .sub.header').text('Status: Charging');
        }
        else
        {
            $('#status i').attr("class", "green circle icon");
            $('#status .content .sub.header').text('Status: Idle');
        }
    });

    $('.menu .item')
        .tab()
        ;
    $('.ui.dropdown')
        .dropdown({
            action: 'activate',
            onChange: function(value, text, $selectedItem)
            {
                $('#ports #select-port .description').remove();
                if ($selectedItem !== undefined)
                {
                    $('#ports').dropdown('set value', $selectedItem.attr('value'));
                    selectedDeviceName = $selectedItem.find('.description').text();
                }
            }
        })
    ;
    $('#duty').on('change', function()
    {
        socket.emit('set duty', $('#duty').val());
    });

    $('#hv-lim').focus(function()
    {
        $('#v-lim-icon').stop();
        $('#v-lim-icon').fadeTo(200, 1);
    });
    $('#hv-lim').focusout(function()
    {
        $('#v-lim-icon').stop();
        $('#v-lim-icon').fadeTo(200, 0.5);
    });
    $('#lv-lim').focus(function()
    {
        $('#v-lim-icon').stop();
        $('#v-lim-icon').fadeTo(200, 0);
    });
    $('#lv-lim').focusout(function()
    {
        $('#v-lim-icon').stop();
        $('#v-lim-icon').fadeTo(200, 0.5);
    });
    $('#batt-max').focus(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 1);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 0.5);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 1);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 0.5);
    });
    $('#batt-max').focusout(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 0.5);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 0.5);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 0.5);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 0.5);
    });
    $('#batt-min').focus(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 1);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 1);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 0.5);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 0.5);
    });
    $('#batt-min').focusout(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 0.5);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 0.5);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 0.5);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 0.5);
    });
    $('#motor-max').focus(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 0.5);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 0.5);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 1);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 1);
    });
    $('#motor-max').focusout(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 0.5);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 0.5);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 0.5);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 0.5);
    });
    $('#motor-min').focus(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 0.5);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 1);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 0.5);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 1);
    });
    $('#motor-min').focusout(function()
    {
        $('#battery-icon').stop();
        $('#battery-icon').fadeTo(200, 0.5);
        $('#left-icon').stop();
        $('#left-icon').fadeTo(200, 0.5);
        $('#right-icon').stop();
        $('#right-icon').fadeTo(200, 0.5);
        $('#motor-icon').stop();
        $('#motor-icon').fadeTo(200, 0.5);
    });
    $('#motor-res').focus(function()
    {
        $('#motor-res-icon').stop();
        $('#motor-res-icon').fadeTo(200, 1);
        $('#motor-ind-icon').stop();
        $('#motor-ind-icon').fadeTo(200, 0.5);
        $('#motor-linkage-icon').stop();
        $('#motor-linkage-icon').fadeTo(200, 0.5);
    });
    $('#motor-res').focusout(function()
    {
        $('#motor-res-icon').stop();
        $('#motor-res-icon').fadeTo(200, 0.5);
        $('#motor-ind-icon').stop();
        $('#motor-ind-icon').fadeTo(200, 0.5);
        $('#motor-linkage-icon').stop();
        $('#motor-linkage-icon').fadeTo(200, 0.5);
    });
    $('#motor-ind').focus(function()
    {
        $('#motor-res-icon').stop();
        $('#motor-res-icon').fadeTo(200, 0.5);
        $('#motor-ind-icon').stop();
        $('#motor-ind-icon').fadeTo(200, 1);
        $('#motor-linkage-icon').stop();
        $('#motor-linkage-icon').fadeTo(200, 0.5);
    });
    $('#motor-ind').focusout(function()
    {
        $('#motor-res-icon').stop();
        $('#motor-res-icon').fadeTo(200, 0.5);
        $('#motor-ind-icon').stop();
        $('#motor-ind-icon').fadeTo(200, 0.5);
        $('#motor-linkage-icon').stop();
        $('#motor-linkage-icon').fadeTo(200, 0.5);
    });
    $('#motor-linkage').focus(function()
    {
        $('#motor-res-icon').stop();
        $('#motor-res-icon').fadeTo(200, 0.5);
        $('#motor-ind-icon').stop();
        $('#motor-ind-icon').fadeTo(200, 0.5);
        $('#motor-linkage-icon').stop();
        $('#motor-linkage-icon').fadeTo(200, 1);
    });
    $('#motor-linkage').focusout(function()
    {
        $('#motor-res-icon').stop();
        $('#motor-res-icon').fadeTo(200, 0.5);
        $('#motor-ind-icon').stop();
        $('#motor-ind-icon').fadeTo(200, 0.5);
        $('#motor-linkage-icon').stop();
        $('#motor-linkage-icon').fadeTo(200, 0.5);
    });
    $('.help.circle.icon')
        .popup(
                {on: 'click'}
              )
        ;

    $("#firmware-update").modal({onHidden: closeModal, keyboardShortcuts: false, autofocus: false});
    var closeModal = function() {
        $("#update-progress").progress('update progress', 0);
        $("#update-progress").progress('remove success');
        $("#update-progress").css('z-index', -100);
        $("#upload-form").fadeTo(200, 1);
        $("#update-progress").fadeTo(200, 0);
        $("#update-button").removeClass("positive");
        $("#update-button").removeClass("disabled");
        $("#update-button").addClass("black");
        $("#update-button").addClass("deny");
        $("#update-button").empty().text("Cancel");
        $("#upload").removeClass("disabled");
        $("#check-online").removeClass("disabled");
    };
    $("#firmware-update-button").click(function() {
        if (connected)
            $("#firmware-update").modal('show');
    });
    $('#update-progress').progress({
          percent: 0
    });
    $('#update-progress').progress('set active');
    $('#upload').click(function(){
        $('#upload-input').click();
    });
    $('#upload-input').change(function() {
        $('#upload-form').submit();
        $('#upload-input').val('');
    });
    $('#upload-form').submit(function() {
	$(this).ajaxSubmit({
	    error: function(xhr) {
		console.log('Error: ' + xhr.status);
	    },

	    success: function(response) {
		$("#update-status").empty().text("Erasing firmware...");
                $("#update-progress").css('z-index', 100);
                $("#upload-form").fadeTo(200, 0);
                $("#update-progress").fadeTo(200, 1);
                $("#update-progress").progress('set total', response.size);
                $("#update-progress").progress('update progress', 0);
                $("#update-progress").progress('remove success');
                $("#update-button").addClass("disabled");
                $("#upload").addClass("disabled");
                $("#check-online").addClass("disabled");
                $("#firmware-update").modal({onHidden: closeModal, closable: false, keyboardShortcuts: false, autofocus: false});
	    }
        });
        return false;
    });
    socket.on('fw erase', function() {
        $("#update-status").empty().text("Uploading firmware...");
    });
    socket.on('fw write', function(progress) {
        $("#update-progress").progress('set progress', progress);
    });
    socket.on('fw complete', function() {
        $("#update-status").empty().text("Upload complete. Entering bootloader...");
    });
    socket.on('fw reset', function() {
        $("#update-status").empty().text("Firmware update complete.");
        $("#update-button").removeClass("black");
        $("#update-button").removeClass("deny");
        $("#update-button").removeClass("disabled");
        $("#update-button").addClass("positive");
        $("#update-button").empty().text("Done");
        $("#firmware-update").modal({onHidden: closeModal, closable: true, keyboardShortcuts: false, autofocus: false});
    });

    socket.on('serial receive', function(data) {
        console.log(data);
        if (waiting)
        {
            if (data == '\r\n')
            {
                $("#cmd").html(inputReset);
                $("#console").scrollTop(999999999);
                cursor = $(".cursor");
                historyIndex = 0;
                waiting = false;
            }
            else
            {
                $("#output").append(data);
                $("#output").append("<br />");
                $("#console").scrollTop(999999999);
            }
        }
    });
    var history = [];
    var inputReset = '<span>battman>&nbsp;</span><span id="input"><span class="cursor">&nbsp;</span></span>';
    var historyIndex = 0;
    var currentCommand;
    var cursor = $(".cursor");
    $("#console").bind("keypress", function(e) {
        if (waiting || !connected)
        {
            return;
        }
        cursor.replaceWith(cursor); // Freeze cursor blinking when typing
        e.preventDefault();
        if (e.which == 32)
        {
            $('<span />').html("&nbsp;").insertBefore(cursor);
        }
        else
        {
            $('<span />').html(String.fromCharCode(e.keyCode)).insertBefore(cursor);
        }
    });
    $("#console").bind("keydown", function(e) {
        if (!connected)
        {
            return;
        }
        if (waiting)
        {
            if (e.ctrlKey && e.which == 67)
            {
                $("#cmd").html(inputReset);
                $("#console").scrollTop(999999999);
                cursor = $(".cursor");
                historyIndex = 0;
                waiting = false;
            }
            return;
        }
        cursor.replaceWith(cursor); // Freeze cursor blinking when typing
        if (e.keyCode == 8) {
            cursor.prev().remove();
            e.preventDefault();
        }
        else if (e.ctrlKey && e.which == 67)
        {
            $("#cmd").html(inputReset);
            cursor = $(".cursor");
            historyIndex = 0;
            e.preventDefault();
        }
        else if (e.which == 13)
        {
            cursor.removeClass('cursor');
            $("#output").append($("#cmd").html());
            $("#output").append("<br />");
            $("#console").scrollTop(999999999);
            if ($.trim($("#cmd #input").text()) != '')
            {
                history.push($("#cmd #input").html());
                var trimmed = $.trim($("#cmd #input").text()).replace(/\s+/g, " ");
                trimmed = trimmed.replace(/[^\x20-\x7E]+/g, '');
                socket.emit('serial send', trimmed);
                $("#cmd").html('<span class="cursor noblink">&nbsp;</span>');
                waiting = true;
            }
            else
            {
                $("#cmd").html(inputReset);
                cursor = $(".cursor");
                historyIndex = 0;
                waiting = false;
            }
            e.preventDefault();
        }
        else if (e.which == 37)
        {
            var temp = cursor.prev();
            if (temp.is('span'))
            {
                cursor.removeClass("cursor");
                cursor = temp;
                cursor.addClass("cursor");
            }
            e.preventDefault();
        }
        else if (e.which == 39)
        {
            var temp = cursor.next();
            if (temp.is('span'))
            {
                cursor.removeClass("cursor");
                cursor = temp;
                cursor.addClass("cursor");
            }
            e.preventDefault();
        }
        else if (e.which == 38)
        {
            if (historyIndex < history.length)
            {
                if (historyIndex == 0)
                {
                    currentCommand = $("#cmd #input").html();
                }
                historyIndex++;
                $("#cmd #input").html(history[history.length - historyIndex]);
                cursor = $("#cmd #input").children().last();
                cursor.addClass("cursor");
            }
            e.preventDefault();
        }
        else if (e.which == 40)
        {
            if (historyIndex > 0)
            {
                if (historyIndex == 1)
                {
                    $("#cmd #input").html(currentCommand);
                }
                historyIndex--;
                $("#cmd #input").html(history[history.length - historyIndex]);
                cursor = $("#cmd #input").children().last();
                cursor.addClass("cursor");
            }
            e.preventDefault();
        }
    });
});
